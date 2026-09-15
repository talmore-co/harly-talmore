import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  organization,
  user,
  candidates,
  jobs,
  jobStages,
  applications,
  candidateReferrals,
  applicationStageHistory,
  customRoles,
  jobHiringTeam,
} from "@harly/db";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn().mockResolvedValue(null),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));
import { addCandidateToPipeline } from "./pipeline-actions";
import { requireCandidatePermission } from "@/features/workspaces/permissions-server";

const integration =
  process.env.RUN_CANDIDATE_PIPELINE_INTEGRATION === "1"
    ? describe
    : describe.skip;
integration("candidate access and direct pipeline assignment", () => {
  const workspaceId = `pipeline-${randomUUID()}`;
  const otherWorkspaceId = `pipeline-${randomUUID()}`;
  const userId = randomUUID();
  const candidateId = randomUUID();
  const jobId = randomUUID();
  const oldJobId = randomUUID();
  const stageId = randomUUID();
  const oldStageId = randomUUID();
  let seeded = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("eval")
    )
      throw new Error("Use isolated local evaluation database.");
    seeded = true;
    await db
      .insert(organization)
      .values(
        [workspaceId, otherWorkspaceId].map((id) => ({
          id,
          slug: id,
          name: "Fictional pipeline test",
          createdAt: new Date(),
        })),
      );
    await db
      .insert(user)
      .values({
        id: userId,
        name: "Fictional Referrer",
        email: `${userId}@example.test`,
      });
    await db
      .insert(candidates)
      .values({
        id: candidateId,
        workspaceId,
        firstName: "Fictional",
        lastName: "Candidate",
        email: "candidate@example.test",
      });
    await db
      .insert(jobs)
      .values(
        [jobId, oldJobId].map((id) => ({
          id,
          workspaceId,
          createdById: userId,
          title: "Fictional Role",
          slug: id,
          employmentType: "full_time" as const,
          workplaceType: "remote" as const,
          description: "Test only",
          status: "open" as const,
          deletedAt: id === oldJobId ? new Date() : null,
        })),
      );
    await db.insert(jobStages).values([
      { id: stageId, jobId, workspaceId, name: "Applied", order: 0 },
      {
        id: oldStageId,
        jobId: oldJobId,
        workspaceId,
        name: "Applied",
        order: 0,
      },
    ]);
    await db
      .insert(customRoles)
      .values({
        workspaceId,
        key: "test-scoped",
        name: "Test scoped",
        permissions: ["candidates:view", "candidates:edit"],
        scope: { jobAccess: "assigned" },
      });
  });
  beforeEach(async () => {
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "owner",
    });
    await db
      .delete(applications)
      .where(eq(applications.workspaceId, workspaceId));
    await db
      .delete(candidateReferrals)
      .where(eq(candidateReferrals.workspaceId, workspaceId));
    await db
      .delete(jobHiringTeam)
      .where(eq(jobHiringTeam.workspaceId, workspaceId));
    await db
      .update(candidates)
      .set({ deletedAt: null })
      .where(eq(candidates.id, candidateId));
  });
  afterAll(async () => {
    if (!seeded) return;
    await db
      .delete(organization)
      .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(eq(user.id, userId));
  });
  const rows = () =>
    db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.jobId, jobId),
        ),
      );
  it("keeps a candidate accessible to the owner when the only application belongs to a trashed job", async () => {
    await db
      .insert(applications)
      .values({
        workspaceId,
        candidateId,
        jobId: oldJobId,
        currentStageId: oldStageId,
      });
    await expect(
      requireCandidatePermission("candidates:view", candidateId),
    ).resolves.toBeDefined();
  });
  it("rejects missing, trashed and other-workspace candidates even for owners", async () => {
    await expect(
      requireCandidatePermission("candidates:view", randomUUID()),
    ).rejects.toThrow();
    mocks.context.mockResolvedValue({
      organization: { id: otherWorkspaceId },
      user: { id: userId },
      roleKey: "owner",
    });
    await expect(
      requireCandidatePermission("candidates:view", candidateId),
    ).rejects.toThrow();
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "owner",
    });
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    await expect(
      requireCandidatePermission("candidates:view", candidateId),
    ).rejects.toThrow();
  });
  it("does not grant assigned-only recruiters access through trashed jobs", async () => {
    await db
      .insert(applications)
      .values({
        workspaceId,
        candidateId,
        jobId: oldJobId,
        currentStageId: oldStageId,
      });
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "test-scoped",
    });
    await expect(
      requireCandidatePermission("candidates:view", candidateId),
    ).rejects.toThrow();
    expect((await addCandidateToPipeline({ candidateId, jobId })).success).toBe(
      false,
    );
    expect(await rows()).toHaveLength(0);
  });
  it("creates a referral application in the first stage and retains attribution", async () => {
    const [referral] = await db
      .insert(candidateReferrals)
      .values({
        workspaceId,
        candidateId,
        jobId,
        referredById: userId,
        createdById: userId,
        note: "Fictional recommendation",
      })
      .returning();
    expect((await addCandidateToPipeline({ candidateId, jobId })).success).toBe(
      true,
    );
    const [application] = await rows();
    expect(application).toMatchObject({
      source: "referral",
      currentStageId: stageId,
      status: "active",
    });
    expect(
      await db
        .select()
        .from(applicationStageHistory)
        .where(eq(applicationStageHistory.applicationId, application!.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(candidateReferrals)
        .where(eq(candidateReferrals.id, referral!.id)),
    ).toMatchObject([
      { referredById: userId, note: "Fictional recommendation" },
    ]);
  });
  it("retains access for an assigned recruiter through a live job", async () => {
    await db.insert(applications).values({ workspaceId, candidateId, jobId, currentStageId: stageId });
    await db.insert(jobHiringTeam).values({ workspaceId, jobId, userId });
    mocks.context.mockResolvedValue({ organization: { id: workspaceId }, user: { id: userId }, roleKey: "test-scoped" });
    await expect(requireCandidatePermission("candidates:view", candidateId)).resolves.toBeDefined();
  });
  it("uses Manual for a different job's referral and prevents concurrent duplicate applications", async () => {
    await db
      .insert(candidateReferrals)
      .values({
        workspaceId,
        candidateId,
        jobId: oldJobId,
        referredById: userId,
        createdById: userId,
      });
    const results = await Promise.all([
      addCandidateToPipeline({ candidateId, jobId }),
      addCandidateToPipeline({ candidateId, jobId }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await rows()).toMatchObject([{ source: "manual" }]);
    expect(await rows()).toHaveLength(1);
  });
  it("rejects trashed target jobs without creating an application", async () => {
    expect(
      (await addCandidateToPipeline({ candidateId, jobId: oldJobId })).success,
    ).toBe(false);
    expect(await rows()).toHaveLength(0);
  });
});
