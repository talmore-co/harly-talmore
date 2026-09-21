import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { activityEvents, applications, candidates, db, emailOutbox, interviews, jobs, jobStages, organization, user } from "@harly/db";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.context }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { logCandidateCall, listCandidateCalls } from "./call-actions";
const integration = process.env.RUN_CANDIDATE_COMMUNICATION_INTEGRATION === "1" ? describe : describe.skip;
integration("candidate call logs", () => {
  const workspaceId = randomUUID(), actorId = randomUUID(), candidateId = randomUUID(), otherCandidateId = randomUUID(), jobId = randomUUID(), applicationId = randomUUID(), stageId = randomUUID();
  const input = () => ({ id: randomUUID(), candidateId, applicationId, occurredAt: new Date(Date.now() - 60000).toISOString(), direction: "outbound" as const, purpose: "scheduling" as const, outcome: "no_answer" as const, notes: "Fictional scheduling follow-up. Try tomorrow." });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/harly_talmore_eval') throw new Error("Use evaluation DB");
    await db.insert(user).values({ id: actorId, name: "Fictional caller", email: `${actorId}@example.test` });
    await db.insert(organization).values({ id: workspaceId, name: "Fictional call tests", slug: workspaceId, createdAt: new Date() });
    await db.insert(candidates).values([candidateId,otherCandidateId].map((id) => ({ id, workspaceId, firstName: "Fictional", lastName: "Call", email: `${id}@example.test` })));
    await db.insert(jobs).values({ id: jobId, workspaceId, title: "Fictional call role", slug: jobId, employmentType: "full_time", workplaceType: "onsite", description: "Fixture", createdById: actorId });
    await db.insert(jobStages).values({ id: stageId, workspaceId, jobId, name: "Applied", order: 0 });
    await db.insert(applications).values({ id: applicationId, workspaceId, candidateId, jobId, currentStageId: stageId });
    mocks.context.mockResolvedValue({ organization: { id: workspaceId }, user: { id: actorId }, roleKey: "owner" });
  });
  afterAll(async () => { await db.delete(organization).where(eq(organization.id, workspaceId)); await db.delete(user).where(eq(user.id, actorId)); });
  it("records a call once without scheduling, sending mail or moving the application", async () => {
    const call = input();
    expect(await logCandidateCall(call)).toEqual({ success: true });
    expect(await logCandidateCall(call)).toEqual({ success: true });
    expect(await db.select().from(activityEvents).where(and(eq(activityEvents.workspaceId, workspaceId), eq(activityEvents.id, call.id)))).toHaveLength(1);
    expect(await listCandidateCalls(candidateId)).toMatchObject([{ id: call.id, authorName: "Fictional caller", purpose: "scheduling", outcome: "no_answer" }]);
    expect(await db.select().from(interviews).where(eq(interviews.workspaceId, workspaceId))).toHaveLength(0);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
    expect(app.currentStageId).toBe(stageId);
  });
  it("rejects mismatched applications, future calls and unauthorized access", async () => {
    expect(await logCandidateCall({ ...input(), candidateId: otherCandidateId })).toMatchObject({ success: false });
    expect(await logCandidateCall({ ...input(), occurredAt: new Date(Date.now() + 86400000).toISOString() })).toMatchObject({ success: false });
    mocks.context.mockResolvedValueOnce({ organization: { id: randomUUID() }, user: { id: actorId }, roleKey: "owner" });
    expect(await logCandidateCall(input())).toMatchObject({ success: false });
  });
});
