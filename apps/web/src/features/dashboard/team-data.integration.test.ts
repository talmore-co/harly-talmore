import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { applications, candidates, db, interviews, jobs, jobStages, mailMessages, mailThreads, organization, scorecards, user } from "@harly/db";
const context = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: async () => ({ organization: { id: context.workspaceId }, user: { id: context.userId } }) }));
import { getTeamDashboardCounts } from "./team-data";
import { getPipelineData } from "@/features/pipeline/data";
import { getCandidatesNeedingReview, getTodayInterviews } from "./widgets";
import { getInboxData } from "@/features/mailbox/data";

const integration = process.env.RUN_DASHBOARD_INTEGRATION === "1" ? describe : describe.skip;
integration("team dashboard totals and destinations", () => {
  const jobA = randomUUID(), jobB = randomUUID(), closedJob = randomUUID();
  const initialA = randomUUID(), initialB = randomUUID(), screeningA = randomUUID(), screeningB = randomUUID(), closedStage = randomUUID();
  const reviewerCandidate = randomUUID(), reviewA = randomUUID(), reviewB = randomUUID(), deletedCandidate = randomUUID();
  beforeAll(async () => {
    context.workspaceId = `dashboard-${randomUUID()}`; context.userId = randomUUID();
    await db.insert(organization).values({ id: context.workspaceId, name: "Fictional dashboard", slug: context.workspaceId, createdAt: new Date() });
    await db.insert(user).values({ id: context.userId, name: "Fictional recruiter", email: `${context.userId}@example.test` });
    await db.insert(jobs).values([jobA, jobB, closedJob].map((id) => ({ id, workspaceId: context.workspaceId, createdById: context.userId, title: "Fictional role", slug: id, employmentType: "full_time" as const, workplaceType: "onsite" as const, description: "Fixture", status: id === closedJob ? "closed" as const : "open" as const })));
    await db.insert(jobStages).values([
      { id: initialA, jobId: jobA, name: "Applied", order: 10 }, { id: initialB, jobId: jobB, name: "New applicants", order: 2 },
      { id: screeningA, jobId: jobA, name: "Screening", order: 20 }, { id: screeningB, jobId: jobB, name: "Screening", order: 3 },
      { id: closedStage, jobId: closedJob, name: "Applied", order: 0 },
    ].map((stage) => ({ ...stage, workspaceId: context.workspaceId })));
    const ids = Array.from({ length: 62 }, () => randomUUID());
    await db.insert(candidates).values([...ids, reviewerCandidate, deletedCandidate].map((id) => ({ id, workspaceId: context.workspaceId, firstName: "Fictional", lastName: id, email: `${id}@example.test`, deletedAt: id === deletedCandidate ? new Date() : null })));
    await db.insert(applications).values([
      ...ids.slice(0, 60).map((candidateId, index) => ({ id: randomUUID(), candidateId, jobId: index % 2 ? jobB : jobA, currentStageId: index % 2 ? initialB : initialA })),
      { id: reviewA, candidateId: reviewerCandidate, jobId: jobA, currentStageId: screeningA },
      { id: reviewB, candidateId: reviewerCandidate, jobId: jobB, currentStageId: screeningB },
      { id: randomUUID(), candidateId: ids[60], jobId: closedJob, currentStageId: closedStage },
      { id: randomUUID(), candidateId: ids[61], jobId: jobA, currentStageId: initialA, status: "rejected" as const },
      { id: randomUUID(), candidateId: deletedCandidate, jobId: jobA, currentStageId: initialA },
    ].map((application) => ({ ...application, workspaceId: context.workspaceId })));
    await db.insert(scorecards).values({ workspaceId: context.workspaceId, candidateId: reviewerCandidate, applicationId: reviewA, stageId: screeningA, stageName: "Screening", authorId: context.userId, rating: "strong" });
    const threadIds = Array.from({ length: 12 }, () => randomUUID());
    await db.insert(mailThreads).values(threadIds.map((id, index) => ({ id, workspaceId: context.workspaceId, source: "provider" as const, subject: "Fictional thread", normalizedSubject: "fictional thread", candidateId: index === 11 ? deletedCandidate : null, status: index === 10 ? "archived" : "open" })));
    await db.insert(mailMessages).values(threadIds.map((threadId, index) => ({ workspaceId: context.workspaceId, threadId, direction: index === 9 ? "outbound" as const : "inbound" as const, fromEmail: "fictional@example.test", subject: "Fixture", textBody: "Fixture" })));
    await db.insert(interviews).values([
      ["2026-09-18T15:59:59Z", "scheduled"], ["2026-09-18T16:00:00Z", "scheduled"],
      ["2026-09-19T15:59:59Z", "completed"], ["2026-09-19T16:00:00Z", "scheduled"], ["2026-09-19T01:00:00Z", "canceled"],
      ["2026-03-08T05:00:00Z", "scheduled"], ["2026-03-09T03:59:59Z", "scheduled"], ["2026-03-09T04:00:00Z", "scheduled"],
    ].map(([at, status]) => ({ workspaceId: context.workspaceId, applicationId: reviewB, candidateId: reviewerCandidate, jobId: jobB, scheduledAt: new Date(at), status: status as "scheduled" | "completed" | "canceled" })));
  });
  afterAll(async () => { await db.delete(organization).where(eq(organization.id, context.workspaceId)); await db.delete(user).where(eq(user.id, context.userId)); });
  it("matches the existing pipeline filters without truncating totals", async () => {
    expect(await getTeamDashboardCounts()).toEqual({ screening: 30, active: 62, replies: 9 });
    const active = await getPipelineData("all");
    const single = await getPipelineData(jobA);
    expect(active.kind === "ready" && active.applications.length).toBe(62);
    if (active.kind !== "ready") throw new Error("Expected pipeline data");
    const appliedIds = new Set(active.stages.filter((stage) => stage.name === "Applied").map((stage) => stage.id));
    expect(active.applications.filter((application) => appliedIds.has(application.currentStageId))).toHaveLength(30);
    expect(single.kind === "ready" && single.applications.length).toBe(32);
    expect((await getInboxData({ filter: "needs-reply" })).threads).toHaveLength(9);
  });
  it("does not let a scorecard for another job clear the current review", async () => {
    const rows = await getCandidatesNeedingReview();
    expect(rows.some((row) => row.id === reviewB)).toBe(true);
    expect(rows.some((row) => row.id === reviewA)).toBe(false);
  });
  it("uses local midnight, excludes cancellations, and handles a 23-hour DST day", async () => {
    expect(await getTodayInterviews("Asia/Manila", "2026-09-19")).toHaveLength(2);
    expect(await getTodayInterviews("America/New_York", "2026-03-08")).toHaveLength(2);
  });
});
