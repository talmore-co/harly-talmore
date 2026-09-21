import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { applications, automationBookingInvitations, candidates, db, domainEventOutbox, emailOutbox, interviews, jobs, jobStages, member, organization, personalCalConnections, personalCalEvents, user, workflowDefinitions, workflowRuns } from "@harly/db";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: vi.fn() }));
vi.mock("@/lib/cal/pool-hosts", async (original) => ({ ...await original<typeof import("@/lib/cal/pool-hosts")>(), validateBookingPool: vi.fn().mockResolvedValue("video") }));
import { createWorkflow, publishWorkflow, pauseWorkflow, updateWorkflow } from "./data";
import { validateBookingPool } from "@/lib/cal/pool-hosts";
import { validatePublishedWorkflow } from "./validation";
import { automationActorAllowed } from "./access";
import { dispatchWorkflowEvent } from "./dispatch";
import { dispatchWorkflowTimers } from "./timers";
import { prepareCandidateWorkflowMessage, type CandidateMessagePayload } from "./candidate-messages";
import { WORKFLOW_TEMPLATES } from "./builder/templates";
import type { WorkflowDefinitionInput } from "./schema";
import { renderWorkflowText, workflowTextHtml } from "./message-template";
import { persistCandidateEvaluation } from "@/features/evaluations/service";

describe("workflow message templates", () => {
  it("escapes candidate content and rejects unknown variables", () => {
    expect(workflowTextHtml(renderWorkflowText("Hi {{candidate.firstName}}", { candidate: { firstName: "<script>" } }))).toBe("Hi &lt;script&gt;");
    expect(() => renderWorkflowText("{{candidate.password}}", { candidate: {} })).toThrow("Unknown message variable");
    expect(() => renderWorkflowText("{{constructor}}", {})).toThrow();
  });
});

const integration = process.env.RUN_AUTOMATIONS_INTEGRATION === "1" ? describe : describe.skip;
integration("visual workflow execution", () => {
  const workspaceId = randomUUID(), actorId = randomUUID(), candidateId = randomUUID(), jobId = randomUUID(), applicationId = randomUUID();
  const applied = randomUUID(), screening = randomUUID(), interviewStage = randomUUID();
  const connectionId = randomUUID(), eventId = randomUUID();
  let bookingWorkflowId = "", invitationPayload: CandidateMessagePayload;
  const template = (id: string) => WORKFLOW_TEMPLATES.find((item) => item.id === id)!.build();
  async function publish(input: WorkflowDefinitionInput) {
    const row = await createWorkflow({ workspaceId, createdById: actorId, values: input });
    await publishWorkflow({ workspaceId, id: row.id, publisherId: actorId });
    return row.id;
  }
  const eventPayload = () => ({ application: { id: applicationId, jobId }, candidateId, jobId });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/harly_talmore_eval') throw new Error("Use local evaluation DB");
    await db.insert(user).values({ id: actorId, name: "Fictional automation owner", email: `${actorId}@example.test` });
    await db.insert(organization).values({ id: workspaceId, slug: workspaceId, name: "Fictional automation tests", createdAt: new Date() });
    await db.insert(member).values({ id: randomUUID(), organizationId: workspaceId, userId: actorId, role: "owner", createdAt: new Date() });
    await db.insert(candidates).values({ id: candidateId, workspaceId, firstName: "Fictional", lastName: "Applicant", email: `${candidateId}@example.test` });
    await db.insert(jobs).values({ id: jobId, workspaceId, title: "Fictional role", slug: jobId, status: "open", employmentType: "full_time", workplaceType: "onsite", description: "Fictional fixture", createdById: actorId });
    await db.insert(jobStages).values([{ id: applied, workspaceId, jobId, name: "Applied", order: 0 }, { id: screening, workspaceId, jobId, name: "Screening", order: 1 }, { id: interviewStage, workspaceId, jobId, name: "Interview", order: 2 }]);
    await db.insert(applications).values({ id: applicationId, workspaceId, candidateId, jobId, currentStageId: applied, questionnaireScore: 80 });
    await db.insert(personalCalConnections).values({ id: connectionId, workspaceId, userId: actorId, calUserId: 1, username: "fictional", accountEmail: `${actorId}@example.test`, defaultEventTypeId: 123, apiKeyCiphertext: "fixture-only" });
    await db.insert(personalCalEvents).values({ id: eventId, connectionId, eventTypeId: 123, title: "Fictional screening", bookingUrl: "https://cal.com/fictional/screening", durationMins: 30, webhookId: "fictional", webhookSecret: "fictional-test-only-secret" });
  });
  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, actorId));
  });
  it("publishes editable questionnaire conditions, advances silently and deduplicates events", async () => {
    const id = await publish(template("questionnaire-progression"));
    await dispatchWorkflowEvent(workspaceId, "application.created", eventPayload(), { sourceEventId: "fixture-application", workflowId: id });
    await dispatchWorkflowEvent(workspaceId, "application.created", eventPayload(), { sourceEventId: "fixture-application", workflowId: id });
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
    expect(app.currentStageId).toBe(screening);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    expect(await db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, id))).toHaveLength(1);
  });
  it("does not treat a missing questionnaire result as a qualifying score", async () => {
    const id = await publish(template("questionnaire-progression"));
    await db.update(applications).set({ questionnaireScore: null, currentStageId: applied }).where(eq(applications.id, applicationId));
    await dispatchWorkflowEvent(workspaceId, "application.created", eventPayload(), { workflowId: id, sourceEventId: "unscored" });
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, id));
    expect(run.status).toBe("skipped");
    await db.update(applications).set({ questionnaireScore: 80 }).where(eq(applications.id, applicationId));
  });
  it("queues one tracked booking invitation even across separate matching events", async () => {
    const input = template("score-to-booking");
    input.actions[1].config.interviewerIds = [actorId];
    bookingWorkflowId = await publish(input);
    await dispatchWorkflowEvent(workspaceId, "application.evaluated", eventPayload(), { sourceEventId: "score-missing", workflowId: bookingWorkflowId });
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    await persistCandidateEvaluation({ workspaceId, candidateId, applicationId, jobId, source: "ai", provider: "fixture", modelId: "fixture", engine: "fixture", engineVersion: "1", rubricVersion: "1", result: { score: 85, recommendation: "strong_yes", summary: "Fictional evaluation", strengths: [], gaps: [], criteria: [] }, usedResume: false, generatedById: actorId, inputFingerprintSource: "fixture" });
    expect(await db.select().from(domainEventOutbox).where(and(eq(domainEventOutbox.workspaceId, workspaceId), eq(domainEventOutbox.eventName, "application.evaluated")))).toHaveLength(1);
    for (const sourceEventId of ["score-1", "score-2"]) await dispatchWorkflowEvent(workspaceId, "application.evaluated", eventPayload(), { sourceEventId, workflowId: bookingWorkflowId });
    const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    invitationPayload = rows[0].payload as CandidateMessagePayload;
    const prepared = await prepareCandidateWorkflowMessage(workspaceId, actorId, invitationPayload);
    expect(prepared?.bodyHtml).toContain("Choose your interview time");
    expect(JSON.stringify(rows[0].payload)).not.toContain("harlyBookingRef");
    expect(await prepareCandidateWorkflowMessage(randomUUID(), actorId, invitationPayload)).toBeNull();
  });
  it("follows up from the sent time once, and suppresses the queued message when an interview is booked", async () => {
    const id = await publish(template("booking-followup"));
    const now = new Date();
    await db.update(workflowDefinitions).set({ publishedAt: new Date(now.getTime() - 7200000) }).where(eq(workflowDefinitions.id, id));
    const [invite] = await db.select().from(automationBookingInvitations).where(eq(automationBookingInvitations.workspaceId, workspaceId));
    await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(now.getTime() - 48 * 3600000 - 60000) }).where(eq(emailOutbox.id, invite.outboxId!));
    await dispatchWorkflowTimers(now);
    await dispatchWorkflowTimers(now);
    const rows = await db.select().from(emailOutbox).where(and(eq(emailOutbox.workspaceId, workspaceId), eq(emailOutbox.status, "pending")));
    expect(rows).toHaveLength(1);
    const followup = rows[0].payload as CandidateMessagePayload;
    expect((await prepareCandidateWorkflowMessage(workspaceId, actorId, followup))?.bodyHtml).toContain("Choose your interview time");
    const interviewId = randomUUID();
    await db.insert(interviews).values({ id: interviewId, workspaceId, applicationId, candidateId, jobId, interviewerId: actorId, type: "screening", mode: "phone", status: "scheduled", scheduledAt: new Date(now.getTime() + 24 * 3600000 - 60000) });
    expect(await prepareCandidateWorkflowMessage(workspaceId, actorId, followup)).toBeNull();
    expect(await prepareCandidateWorkflowMessage(workspaceId, actorId, invitationPayload)).toBeNull();
  });
  it("does not repurpose another workflow's invitation for the same application", async () => {
    const input = template("score-to-booking"); input.actions[1].config.interviewerIds = [actorId];
    const id = await publish(input);
    const before = await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId));
    // The earlier reminder fixture created an interview. Cancel it so the
    // invitation ownership guard is the reason this workflow sends nothing.
    await db.update(interviews).set({ status: "canceled" }).where(eq(interviews.workspaceId, workspaceId));
    await dispatchWorkflowEvent(workspaceId, "application.evaluated", eventPayload(), { workflowId: id, sourceEventId: "other-invitation-workflow" });
    const [invitation] = await db.select().from(automationBookingInvitations).where(eq(automationBookingInvitations.workspaceId, workspaceId));
    expect(invitation.workflowId).toBe(bookingWorkflowId);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(before.length);
    await db.update(interviews).set({ status: "scheduled" }).where(eq(interviews.workspaceId, workspaceId));
  });
  it("retires workflow reminders and suppresses their previously queued payloads", async () => {
    const input = template("booking-followup");
    input.trigger = { event: "interview.reminder_due", offsetHours: 24 };
    input.actions = [{ type: "send_interview_reminder", config: { subject: "Reminder", body: "{{interview.when}}" }, continueOnError: false }];
    await expect(publish(input)).rejects.toThrow("Settings → Interviews");
    expect(await prepareCandidateWorkflowMessage(workspaceId, actorId, { ...invitationPayload, kind: "send_interview_reminder" })).toBeNull();
    await db.update(interviews).set({ status: "canceled" }).where(eq(interviews.workspaceId, workspaceId));
  });
  it("pausing or rejecting stops a queued invitation", async () => {
    await db.update(applications).set({ status: "rejected" }).where(eq(applications.id, applicationId));
    expect(await prepareCandidateWorkflowMessage(workspaceId, actorId, invitationPayload)).toBeNull();
    await db.update(applications).set({ status: "active" }).where(eq(applications.id, applicationId));
    await pauseWorkflow({ workspaceId, id: bookingWorkflowId });
    expect(await prepareCandidateWorkflowMessage(workspaceId, actorId, invitationPayload)).toBeNull();
  });
  it("requires explicit republication of legacy workflows and skips pre-publication events", async () => {
    const id = await publish(template("questionnaire-progression"));
    await dispatchWorkflowEvent(workspaceId, "application.created", eventPayload(), { workflowId: id, occurredAt: new Date(0), sourceEventId: "old" });
    expect(await db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, id))).toHaveLength(0);
    await db.update(workflowDefinitions).set({ trigger: { event: "application.created" } }).where(eq(workflowDefinitions.id, id));
    await dispatchWorkflowEvent(workspaceId, "application.created", eventPayload(), { workflowId: id, sourceEventId: "legacy" });
    expect(await db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, id))).toHaveLength(0);
  });
  it("keeps a sent personal link when republishing a changed pool", async () => {
    const [before] = await db.select().from(automationBookingInvitations).where(eq(automationBookingInvitations.workflowId, bookingWorkflowId));
    const nextEvent = randomUUID();
    await db.insert(personalCalEvents).values({ id: nextEvent, connectionId, eventTypeId: 124, title: "Fictional new default", bookingUrl: "https://cal.com/fictional/new-default", durationMins: 30, webhookId: "fixture", webhookSecret: "fixture-only" });
    await db.update(personalCalConnections).set({ defaultEventTypeId: 124 }).where(eq(personalCalConnections.id, connectionId));
    await updateWorkflow({ workspaceId, id: bookingWorkflowId, patch: { description: "Use the current recruiter pool" } });
    await publishWorkflow({ workspaceId, id: bookingWorkflowId, publisherId: actorId });
    await db.delete(personalCalEvents).where(eq(personalCalEvents.id, eventId));
    const [after] = await db.select().from(automationBookingInvitations).where(eq(automationBookingInvitations.id, before.id));
    expect(after.tokenSecret).toBe(before.tokenSecret);
    expect(after.eventIds).toEqual([nextEvent]);
    expect(after.definitionVersion).toBe(2);
  });
  it("does not publish a definition edited while Cal.com validation was in flight", async () => {
    const input = template("score-to-booking"); input.actions[1].config.interviewerIds = [actorId];
    const row = await createWorkflow({ workspaceId, createdById: actorId, values: input });
    vi.mocked(validateBookingPool).mockImplementationOnce(async () => {
      await updateWorkflow({ workspaceId, id: row.id, patch: { description: "Concurrent draft edit" } });
      return "video";
    });
    await expect(publishWorkflow({ workspaceId, id: row.id, publisherId: actorId })).rejects.toThrow("changed during validation");
    const [current] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, row.id));
    expect(current.status).toBe("draft");
    expect(current.enabled).toBe(false);
  });
  it("rejects unknown variables in internal action text before publication", async () => {
    const input = template("questionnaire-progression");
    for (const action of [
      { type: "add_note" as const, config: { body: "{{candidate.notAField}}" } },
      { type: "create_task" as const, config: { title: "Call candidate", description: "{{job.notAField}}" } },
      { type: "add_tag" as const, config: { label: "{{candidate.notAField}}" } },
      { type: "remove_tag" as const, config: { label: "{{candidate.notAField}}" } },
    ]) {
      await expect(validatePublishedWorkflow(workspaceId, actorId, { ...input, actions: [{ ...action, continueOnError: false }] })).rejects.toThrow("Unknown message variable");
    }
    await expect(validatePublishedWorkflow(workspaceId, actorId, { ...input, actions: [{ type: "add_note", config: { body: "Call {{candidate.firstName}} about {{job.title}}" }, continueOnError: false }] })).resolves.toBeTruthy();
  });
  it("revokes workflow runtime access when its creator is suspended", async () => {
    await db.update(member).set({ status: "suspended" }).where(eq(member.userId, actorId));
    expect(await automationActorAllowed(workspaceId, actorId)).toBe(false);
    await db.update(member).set({ status: "active" }).where(eq(member.userId, actorId));
  });
});
