import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  activityEvents,
  applications,
  candidates,
  customRoles,
  db,
  interviews,
  jobs,
  jobStages,
  member,
  organization,
  scorecards,
  user,
} from "@harly/db";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { recordInterview } from "./record-actions";
import { createScorecard } from "@/features/candidates/actions";
import { getApplicationScorecard, saveJobScorecard } from "@/features/candidates/scorecard-actions";
import { definitionToken, type ScorecardDimension } from "@/features/candidates/scorecard-definition";
import { getPortalApplicationInterviews } from "@/server/portal-applications";

const integration =
  process.env.RUN_RECORD_INTERVIEW_INTEGRATION === "1"
    ? describe
    : describe.skip;
integration("record completed interviews", () => {
  const workspaces = [randomUUID(), randomUUID()],
    userId = randomUUID();
  const candidateIds = workspaces.map(() => randomUUID()),
    jobIds = workspaces.map(() => randomUUID()),
    appIds = workspaces.map(() => randomUUID());
  const context = (roleKey = "owner") =>
    mocks.context.mockResolvedValue({
      organization: { id: workspaces[0] },
      user: { id: userId },
      roleKey,
    });
  const input = () => ({
    id: randomUUID(),
    candidateId: candidateIds[0],
    applicationId: appIds[0],
    type: "screening",
    mode: "phone",
    scheduledAt: "2026-01-12T14:00",
    timeZone: "Asia/Manila",
    durationMins: 20,
    interviewerId: userId,
    internalNotes: "Private screening notes",
    rating: "strong",
    assessment: "Clear examples",
  });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/harly_talmore_eval"
    )
      throw new Error("Use local evaluation database");
    await db
      .insert(user)
      .values({
        id: userId,
        name: "Fictional interviewer",
        email: `${userId}@example.test`,
      });
    for (let i = 0; i < 2; i++) {
      const workspaceId = workspaces[i],
        stageId = randomUUID();
      await db
        .insert(organization)
        .values({
          id: workspaceId,
          slug: workspaceId,
          name: "Fictional interview workspace",
          createdAt: new Date(),
        });
      await db
        .insert(member)
        .values({
          id: randomUUID(),
          organizationId: workspaceId,
          userId,
          role: "owner",
          createdAt: new Date(),
        });
      await db
        .insert(candidates)
        .values({
          id: candidateIds[i],
          workspaceId,
          firstName: "Fictional",
          lastName: "Interview",
          email: `${candidateIds[i]}@example.test`,
        });
      await db
        .insert(jobs)
        .values({
          id: jobIds[i],
          workspaceId,
          createdById: userId,
          title: "Fictional interview role",
          slug: jobIds[i],
          employmentType: "full_time",
          workplaceType: "onsite",
          description: "Fixture",
          status: "open",
        });
      await db
        .insert(jobStages)
        .values({
          id: stageId,
          workspaceId,
          jobId: jobIds[i],
          name: "Applied",
          order: 0,
        });
      await db
        .insert(applications)
        .values({
          id: appIds[i],
          workspaceId,
          candidateId: candidateIds[i],
          jobId: jobIds[i],
          currentStageId: stageId,
        });
    }
    await db
      .insert(customRoles)
      .values({
        workspaceId: workspaces[0],
        key: "read-only",
        name: "Read only",
        permissions: ["candidates:view"],
      });
  });
  afterAll(async () => {
    await db.delete(organization).where(inArray(organization.id, workspaces));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("atomically saves internal notes and a linked assessment, with idempotent retries", async () => {
    context();
    const data = input();
    const [before] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, appIds[0]));
    expect(await recordInterview(data)).toMatchObject({ success: true });
    expect(await recordInterview(data)).toMatchObject({ success: true });
    const [saved] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.id, data.id));
    expect(saved).toMatchObject({
      status: "completed",
      source: "recorded",
      internalNotes: data.internalNotes,
      notes: null,
      gcalEventId: null,
      meetLink: null,
    });
    expect(saved.scheduledAt.toISOString()).toBe("2026-01-12T06:00:00.000Z");
    const feedback = await db
      .select()
      .from(scorecards)
      .where(eq(scorecards.interviewId, data.id));
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({
      applicationId: appIds[0],
      rating: "strong",
      comment: "Clear examples",
      authorId: userId,
    });
    const [after] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, appIds[0]));
    expect(after).toEqual(before);
    expect(
      await db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.entityId, candidateIds[0])),
    ).toHaveLength(1);
    const portal = await getPortalApplicationInterviews(appIds[0]);
    expect(portal[0]).not.toHaveProperty("internalNotes");
    expect(portal[0]).not.toHaveProperty("assessment");
  });
  it("allows notes without an assessment", async () => {
    context();
    const data = { ...input(), rating: null, assessment: "" };
    expect(await recordInterview(data)).toMatchObject({ success: true });
    expect(
      await db
        .select()
        .from(scorecards)
        .where(eq(scorecards.interviewId, data.id)),
    ).toHaveLength(0);
  });
  it("rejects future times, invalid interviewers, mismatched candidates and cross-workspace applications", async () => {
    context();
    for (const overrides of [
      { scheduledAt: "2099-01-01T12:00" },
      { interviewerId: randomUUID() },
      { candidateId: candidateIds[1] },
      { applicationId: appIds[1], candidateId: candidateIds[1] },
    ]) {
      const data = { ...input(), ...overrides };
      expect(await recordInterview(data)).toMatchObject({ success: false });
      expect(
        await db.select().from(interviews).where(eq(interviews.id, data.id)),
      ).toHaveLength(0);
    }
  });
  it("requires interview management permission", async () => {
    context("read-only");
    expect(await recordInterview(input())).toMatchObject({ success: false });
  });
  it("saves standalone assessments to the chosen application and its current stage", async () => {
    context();
    const [application] = await db.select().from(applications).where(eq(applications.id, appIds[0]));
    expect(await createScorecard({ candidateId: candidateIds[0], workspaceId: workspaces[0], applicationId: appIds[0], rating: "mixed", comment: "Application-specific assessment" })).toEqual({ success: true });
    const saved = await db.select().from(scorecards).where(eq(scorecards.comment, "Application-specific assessment"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ applicationId: appIds[0], stageId: application.currentStageId, stageName: "Applied", interviewId: null });
    expect(await createScorecard({ candidateId: candidateIds[0], workspaceId: workspaces[0], applicationId: appIds[1], rating: "weak" })).toMatchObject({ success: false });
    context("read-only");
    expect(await createScorecard({ candidateId: candidateIds[0], workspaceId: workspaces[0], applicationId: appIds[0], rating: "weak" })).toMatchObject({ success: false });
  });
  it("freezes structured dimensions, rejects stale definitions and enforces job/workspace access", async () => {
    context();
    const definition: ScorecardDimension[] = [
      { id: randomUUID(), name: "Communication", guidance: "Explain an issue", type: "recommendation", anchors: ["", "", "", "", ""] },
      { id: randomUUID(), name: "Controller familiarity", guidance: "Ask for examples", type: "scale", anchors: ["None", "Limited", "Adequate", "Experienced", "Expert"] },
      { id: randomUUID(), name: "Shift availability", guidance: "Confirm schedule", type: "boolean", anchors: ["", "", "", "", ""] },
    ];
    expect(await saveJobScorecard(jobIds[0], definition, "[]")).toEqual({ success: true });
    const loaded = await getApplicationScorecard(appIds[0], candidateIds[0]);
    expect(loaded).toMatchObject({ success: true, dimensions: definition });
    const scorecard = { definitionToken: definitionToken(definition), responses: definition.map((item, i) => ({ id: item.id, value: i === 0 ? "strong" : i === 1 ? 4 : null, comment: "Evidence" })) };
    expect(await createScorecard({ candidateId: candidateIds[0], workspaceId: workspaces[0], applicationId: appIds[0], rating: "mixed", comment: "Frozen scorecard", scorecard })).toEqual({ success: true });
    expect(await recordInterview({ ...input(), scorecard })).toMatchObject({ success: true });
    const revised = definition.map((item) => ({ ...item, name: `${item.name} revised` }));
    expect(await saveJobScorecard(jobIds[0], revised, definitionToken(definition))).toEqual({ success: true });
    expect(await saveJobScorecard(jobIds[0], definition, definitionToken(definition))).toMatchObject({ success: false });
    expect(await createScorecard({ candidateId: candidateIds[0], workspaceId: workspaces[0], applicationId: appIds[0], rating: "strong", scorecard })).toMatchObject({ success: false });
    const [saved] = await db.select().from(scorecards).where(eq(scorecards.comment, "Frozen scorecard"));
    expect(saved.criteria).toMatchObject([{ name: "Communication", value: "strong" }, { name: "Controller familiarity", value: 4, anchors: definition[1].anchors }, { name: "Shift availability", value: null }]);
    expect(await getApplicationScorecard(appIds[1], candidateIds[1])).toMatchObject({ success: false });
    context("read-only");
    expect(await saveJobScorecard(jobIds[0], [], definitionToken(revised))).toMatchObject({ success: false });
  });
});
