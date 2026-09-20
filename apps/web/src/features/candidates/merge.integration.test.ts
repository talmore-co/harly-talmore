import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  applications,
  applicationAnswers,
  applicationMerges,
  candidateMerges,
  candidates,
  candidateTags,
  candidateDuplicateDismissals,
  candidatePortalSessions,
  emailOutbox,
  clients,
  clientOffers,
  customRoles,
  db,
  jobs,
  jobStages,
  applicationQuestions,
  organization,
  tasks,
  user,
} from "@harly/db";
import {
  resolveMergedCandidateId,
  resolveMergedApplicationId,
} from "./merge-aliases";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { mergeCandidateRecords, previewCandidateMerge } from "./merge-service";
import { dismissCandidateDuplicate } from "./duplicate-actions";
import { duplicateSuspects } from "./duplicate-signals";

const integration =
  process.env.RUN_MERGE_INTEGRATION === "1" ? describe : describe.skip;
integration("candidate merge transaction", () => {
  const workspaceId = `merge-${randomUUID()}`,
    otherWorkspaceId = `merge-${randomUUID()}`,
    userId = randomUUID();
  const primaryId = randomUUID(),
    sourceId = randomUUID(),
    outsideId = randomUUID(),
    clientId = randomUUID();
  const jobIds = [randomUUID(), randomUUID()],
    stageIds = jobIds.map(() => randomUUID()),
    appIds = [randomUUID(), randomUUID(), randomUUID()],
    questionId = randomUUID();
  const context = (roleKey = "owner") =>
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey,
    });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/harly_talmore_eval"
    )
      throw new Error("Use local evaluation database");
    await db.insert(organization).values(
      [workspaceId, otherWorkspaceId].map((id) => ({
        id,
        slug: id,
        name: "Fictional merge workspace",
        createdAt: new Date(),
      })),
    );
    await db.insert(user).values({
      id: userId,
      name: "Fictional merge reviewer",
      email: `${userId}@example.test`,
    });
    await db.insert(candidates).values(
      [
        { id: primaryId, workspaceId, phone: null },
        { id: sourceId, workspaceId, phone: "+639001234567" },
        { id: outsideId, workspaceId: otherWorkspaceId, phone: null },
      ].map((row) => ({
        ...row,
        firstName: "Fictional",
        lastName: "Merge",
        email: `${row.id}@example.test`,
      })),
    );
    await db
      .insert(clients)
      .values({ id: clientId, workspaceId, name: "Fictional client" });
    for (let i = 0; i < 2; i++) {
      await db.insert(jobs).values({
        id: jobIds[i],
        workspaceId,
        createdById: userId,
        title: `Fictional merge role ${i}`,
        slug: jobIds[i],
        employmentType: "full_time",
        workplaceType: "onsite",
        description: "Fixture",
        status: "open",
        clientId,
      });
      await db.insert(jobStages).values({
        id: stageIds[i],
        workspaceId,
        jobId: jobIds[i],
        name: "Applied",
        order: 0,
      });
    }
    await db.insert(applications).values([
      {
        id: appIds[0],
        workspaceId,
        candidateId: primaryId,
        jobId: jobIds[0],
        currentStageId: stageIds[0],
        questionnaireScore: 20,
        inboundToken: randomUUID(),
      },
      {
        id: appIds[1],
        workspaceId,
        candidateId: sourceId,
        jobId: jobIds[0],
        currentStageId: stageIds[0],
        questionnaireScore: 80,
        hiredOn: "2026-09-15",
        status: "hired",
        inboundToken: randomUUID(),
      },
      {
        id: appIds[2],
        workspaceId,
        candidateId: sourceId,
        jobId: jobIds[1],
        currentStageId: stageIds[1],
      },
    ]);
    await db.insert(applicationQuestions).values({
      id: questionId,
      workspaceId,
      jobId: jobIds[0],
      key: "q",
      label: "Question",
      type: "text",
      order: 0,
    });
    await db.insert(applicationAnswers).values([
      {
        workspaceId,
        applicationId: appIds[0],
        questionId,
        answer: "Primary answer",
      },
      {
        workspaceId,
        applicationId: appIds[1],
        questionId,
        answer: "Other answer",
      },
    ]);
    await db.insert(tasks).values({
      workspaceId,
      candidateId: primaryId,
      applicationId: appIds[0],
      jobId: jobIds[0],
      ownerId: userId,
      createdById: userId,
      title: "Keep this task",
    });
    await db.insert(candidateTags).values(
      [primaryId, sourceId].map((candidateId, i) => ({
        workspaceId,
        candidateId,
        label: i ? "SAME TAG" : "Same tag",
      })),
    );
    await db.insert(emailOutbox).values({
      workspaceId,
      kind: "application_receipt",
      payload: { candidateId: sourceId, applicationId: appIds[0] },
    });
    await db.insert(candidatePortalSessions).values({
      workspaceId,
      candidateId: sourceId,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(clientOffers).values(
      [0, 1].map((i) => ({
        workspaceId,
        candidateId: i === 0 ? primaryId : sourceId,
        applicationId: appIds[i],
        jobId: jobIds[0],
        clientId,
        offeredOn: "2026-09-10",
        terms: `Offer ${i}`,
      })),
    );
    await db.insert(customRoles).values([
      {
        workspaceId,
        key: "read-only-merge",
        name: "Reader",
        permissions: ["candidates:view"],
      },
      {
        workspaceId,
        key: "assigned-merge",
        name: "Assigned",
        permissions: [
          "candidates:view",
          "candidates:edit",
          "candidates:delete",
        ],
        scope: { jobAccess: "assigned" },
      },
    ]);
    context();
  });
  afterAll(async () => {
    await db
      .delete(organization)
      .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("supports persistent symmetric dismissal without AI", async () => {
    expect(
      (await duplicateSuspects(workspaceId, primaryId)).map(
        (row) => row.candidateId,
      ),
    ).toContain(sourceId);
    await dismissCandidateDuplicate(primaryId, sourceId);
    expect(await duplicateSuspects(workspaceId, sourceId)).toEqual([]);
    await db
      .delete(candidateDuplicateDismissals)
      .where(eq(candidateDuplicateDismissals.workspaceId, workspaceId));
  });
  it("rejects other workspaces, read-only writes and scoped access", async () => {
    await expect(previewCandidateMerge(primaryId, outsideId)).rejects.toThrow();
    const review = await previewCandidateMerge(primaryId, sourceId);
    context("read-only-merge");
    await expect(
      mergeCandidateRecords({
        primaryId,
        sourceId,
        revision: review.revision,
        fields: {},
        applicationChoices: {},
      }),
    ).rejects.toThrow();
    context("assigned-merge");
    await expect(previewCandidateMerge(primaryId, sourceId)).rejects.toThrow(
      "workspace-wide",
    );
    context();
  });
  it("requires a choice for overlapping jobs and rejects stale previews atomically", async () => {
    const review = await previewCandidateMerge(primaryId, sourceId);
    await expect(
      mergeCandidateRecords({
        primaryId,
        sourceId,
        revision: review.revision,
        fields: {},
        applicationChoices: {},
      }),
    ).rejects.toThrow("Choose the application");
    await db
      .update(candidates)
      .set({ headline: "Updated after preview" })
      .where(eq(candidates.id, sourceId));
    await expect(
      mergeCandidateRecords({
        primaryId,
        sourceId,
        revision: review.revision,
        fields: {},
        applicationChoices: { [jobIds[0]]: appIds[1] },
      }),
    ).rejects.toThrow("changed");
    expect(
      await db
        .select()
        .from(candidates)
        .where(inArray(candidates.id, [primaryId, sourceId])),
    ).toHaveLength(2);
  });
  it("keeps the selected source application, combines dependents, archives conflicts and redirects", async () => {
    const review = await previewCandidateMerge(primaryId, sourceId);
    const result = await mergeCandidateRecords({
      primaryId,
      sourceId,
      revision: review.revision,
      fields: { email: "source" },
      applicationChoices: { [jobIds[0]]: appIds[1] },
    });
    expect(result.candidateId).toBe(primaryId);
    expect(
      await db
        .select()
        .from(candidatePortalSessions)
        .where(eq(candidatePortalSessions.workspaceId, workspaceId)),
    ).toHaveLength(0);
    const queued = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.workspaceId, workspaceId));
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      status: "pending",
      payload: { candidateId: primaryId, applicationId: appIds[1] },
    });
    const [person] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, primaryId));
    expect(person.email).toBe(`${sourceId}@example.test`);
    expect(person.phone).toBe("+639001234567");
    expect(
      await db.select().from(candidates).where(eq(candidates.id, sourceId)),
    ).toHaveLength(0);
    const current = await db
      .select()
      .from(applications)
      .where(eq(applications.candidateId, primaryId));
    expect(current.map((row) => row.id).sort()).toEqual(
      [appIds[1], appIds[2]].sort(),
    );
    expect(
      current.find((row) => row.id === appIds[1])?.questionnaireScore,
    ).toBe(80);
    expect(
      (
        await db
          .select()
          .from(applicationAnswers)
          .where(eq(applicationAnswers.applicationId, appIds[1]))
      ).map((row) => row.answer),
    ).toEqual(["Other answer"]);
    expect(
      (
        await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))
      )[0],
    ).toMatchObject({ candidateId: primaryId, applicationId: appIds[1] });
    expect(
      (
        await db
          .select()
          .from(clientOffers)
          .where(eq(clientOffers.workspaceId, workspaceId))
      ).map((row) => [row.candidateId, row.applicationId]),
    ).toEqual([
      [primaryId, appIds[1]],
      [primaryId, appIds[1]],
    ]);
    expect(
      await db
        .select()
        .from(candidateTags)
        .where(eq(candidateTags.candidateId, primaryId)),
    ).toHaveLength(1);
    const [audit] = await db
      .select()
      .from(candidateMerges)
      .where(eq(candidateMerges.sourceId, sourceId));
    expect(JSON.stringify(audit.snapshot)).toContain("Primary answer");
    expect(
      (
        await db
          .select()
          .from(applicationMerges)
          .where(eq(applicationMerges.sourceId, appIds[0]))
      )[0].applicationId,
    ).toBe(appIds[1]);
    await expect(
      mergeCandidateRecords({
        primaryId,
        sourceId,
        revision: review.revision,
        fields: {},
        applicationChoices: {},
      }),
    ).rejects.toThrow();
  });
  it("keeps an unscored primary application without importing the discarded answers", async () => {
    const ids = [randomUUID(), randomUUID()];
    const apps = [randomUUID(), randomUUID()];
    await db
      .insert(candidates)
      .values(
        ids.map((id) => ({
          id,
          workspaceId,
          firstName: "Fictional",
          lastName: "Unscored merge",
          email: `${id}@example.test`,
        })),
      );
    await db
      .insert(applications)
      .values(
        ids.map((candidateId, index) => ({
          id: apps[index],
          workspaceId,
          candidateId,
          jobId: jobIds[0],
          currentStageId: stageIds[0],
          questionnaireScore: index ? 90 : null,
        })),
      );
    await db
      .insert(applicationAnswers)
      .values({
        workspaceId,
        applicationId: apps[1],
        questionId,
        answer: "Keep only in audit",
      });
    const preview = await previewCandidateMerge(ids[0], ids[1]);
    await mergeCandidateRecords({
      primaryId: ids[0],
      sourceId: ids[1],
      revision: preview.revision,
      fields: {},
      applicationChoices: { [jobIds[0]]: apps[0] },
    });
    expect(
      (
        await db.select().from(applications).where(eq(applications.id, apps[0]))
      )[0].questionnaireScore,
    ).toBeNull();
    expect(
      await db
        .select()
        .from(applicationAnswers)
        .where(eq(applicationAnswers.applicationId, apps[0])),
    ).toHaveLength(0);
    const [audit] = await db
      .select()
      .from(candidateMerges)
      .where(eq(candidateMerges.sourceId, ids[1]));
    expect(JSON.stringify(audit.snapshot)).toContain("Keep only in audit");
  });
  it("serializes concurrent merges and preserves redirects through a later merge without shared jobs", async () => {
    const finalId = randomUUID();
    await db.insert(candidates).values({
      id: finalId,
      workspaceId,
      firstName: "Fictional",
      lastName: "Final merge",
      email: `${finalId}@example.test`,
    });
    const review = await previewCandidateMerge(finalId, primaryId);
    const input = {
      primaryId: finalId,
      sourceId: primaryId,
      revision: review.revision,
      fields: {},
      applicationChoices: {},
    };
    const results = await Promise.allSettled([
      mergeCandidateRecords(input),
      mergeCandidateRecords(input),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(await resolveMergedCandidateId(workspaceId, sourceId)).toBe(finalId);
    expect(await resolveMergedCandidateId(workspaceId, primaryId)).toBe(
      finalId,
    );
    expect(await resolveMergedCandidateId(otherWorkspaceId, sourceId)).toBe(
      sourceId,
    );
    expect(await resolveMergedApplicationId(workspaceId, appIds[0])).toBe(
      appIds[1],
    );
    expect(
      await db
        .select()
        .from(applications)
        .where(eq(applications.candidateId, finalId)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(candidateMerges)
        .where(eq(candidateMerges.candidateId, finalId)),
    ).toHaveLength(2);
  });
});
