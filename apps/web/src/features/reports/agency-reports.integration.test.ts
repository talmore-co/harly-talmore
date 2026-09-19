import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  applications,
  applicationStageHistory,
  candidates,
  clientOffers,
  clients,
  customRoles,
  db,
  jobHiringTeam,
  jobs,
  jobStages,
  organization,
  user,
} from "@harly/db";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
import { getAgencyReports } from "./agency-data";
import { listJobsWithStats, listTrashedJobs } from "@/features/jobs/data";
import { saveRoleTakenOn } from "@/features/jobs/taken-on-actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const integration =
  process.env.RUN_REPORTS_INTEGRATION === "1" ? describe : describe.skip;
integration("agency report queries and scope", () => {
  const workspaceId = `reports-${randomUUID()}`,
    otherWorkspaceId = `reports-${randomUUID()}`,
    userId = randomUUID();
  const clientId = randomUUID(),
    jobIds = Array.from({ length: 4 }, () => randomUUID()),
    appIds = jobIds.map(() => randomUUID()),
    candidateIds = jobIds.map(() => randomUUID()),
    stageIds = jobIds.map(() => randomUUID());
  const today = new Date().toISOString().slice(0, 10),
    yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const owner = () =>
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "owner",
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
        name: "Fictional report agency",
        createdAt: new Date(),
      })),
    );
    await db.insert(user).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Fictional report reader",
    });
    await db
      .insert(clients)
      .values({ id: clientId, workspaceId, name: "Fictional report client" });
    for (let i = 0; i < jobIds.length; i++) {
      const ws = i === 3 ? otherWorkspaceId : workspaceId;
      await db.insert(jobs).values({
        id: jobIds[i],
        workspaceId: ws,
        createdById: userId,
        title: `Fictional report role ${i}`,
        slug: jobIds[i],
        employmentType: "full_time",
        workplaceType: "onsite",
        description: "Fixture",
        status: "open",
        clientId: i === 0 ? clientId : null,
        department: i === 0 ? "Operations" : "Other",
        jobLocationRegion: "PH",
        deletedAt: i === 2 ? new Date() : null,
      });
      await db.insert(jobStages).values({
        id: stageIds[i],
        workspaceId: ws,
        jobId: jobIds[i],
        name: "Submitted",
        order: 0,
      });
      await db.insert(candidates).values({
        id: candidateIds[i],
        workspaceId: ws,
        firstName: "Fictional",
        lastName: `Report ${i}`,
        email: `${candidateIds[i]}@example.test`,
      });
      await db.insert(applications).values({
        id: appIds[i],
        workspaceId: ws,
        jobId: jobIds[i],
        candidateId: candidateIds[i],
        currentStageId: stageIds[i],
        appliedAt: new Date(`${yesterday}T00:00:00Z`),
        hiredOn: i === 0 ? today : null,
        questionnaireScoreSnapshot:
          i === 0 ? { version: 1, threshold: 70, qualified: true } : null,
      });
      await db.insert(applicationStageHistory).values({
        workspaceId: ws,
        applicationId: appIds[i],
        toStageId: stageIds[i],
        createdAt: new Date(`${yesterday}T00:00:00Z`),
      });
    }
    await db.insert(clientOffers).values({
      workspaceId,
      applicationId: appIds[0],
      candidateId: candidateIds[0],
      jobId: jobIds[0],
      clientId,
      offeredOn: today,
      status: "accepted",
      decidedAt: new Date(),
    });
    await db.insert(customRoles).values([
      {
        workspaceId,
        key: "report-assigned",
        name: "Assigned report reader",
        permissions: ["reports:read"],
        scope: { jobAccess: "assigned" },
      },
      {
        workspaceId,
        key: "report-department",
        name: "Department report reader",
        permissions: ["reports:read"],
        scope: {
          jobAccess: "all",
          departments: ["operations"],
          regions: ["ph"],
        },
      },
      { workspaceId, key: "no-reports", name: "No reports", permissions: [] },
      {
        workspaceId,
        key: "job-assigned",
        name: "Assigned job reader",
        permissions: ["jobs:view"],
        scope: { jobAccess: "assigned" },
      },
      {
        workspaceId,
        key: "job-department",
        name: "Department job reader",
        permissions: ["jobs:view"],
        scope: {
          jobAccess: "all",
          departments: ["operations"],
          regions: ["ph"],
        },
      },
    ]);
    await db
      .insert(jobHiringTeam)
      .values({ workspaceId, jobId: jobIds[0], userId });
    owner();
  });
  afterAll(async () => {
    await db.delete(jobs).where(inArray(jobs.id, jobIds));
    await db
      .delete(organization)
      .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("combines real records while excluding deleted and foreign jobs", async () => {
    owner();
    const data = await getAgencyReports();
    expect(data.summary).toMatchObject({
      applications: 2,
      submitted: 2,
      placements: 1,
      accepted: 1,
      clientOffers: 1,
    });
    expect(data.options.jobs.map((row) => row.id).sort()).toEqual(
      jobIds.slice(0, 2).sort(),
    );
    expect(data.sources[0]).toMatchObject({ qualified: 1, assessed: 1 });
  });
  it("applies client, no-client and job filters to every report section", async () => {
    owner();
    const client = await getAgencyReports({ client: clientId });
    expect(client.summary).toMatchObject({
      applications: 1,
      submitted: 1,
      placements: 1,
      accepted: 1,
    });
    expect(client.delivery).toHaveLength(1);
    expect(client.records[0].jobId).toBe(jobIds[0]);
    const unlinked = await getAgencyReports({ client: "none" });
    expect(unlinked.summary).toMatchObject({
      applications: 1,
      placements: 0,
      accepted: 0,
    });
    expect(unlinked.delivery[0].id).toBe(jobIds[1]);
    expect((await getAgencyReports({ job: jobIds[3] })).records).toEqual([]);
  });
  it("saves private approval dates with job permission and measures first submission", async () => {
    owner();
    expect((await saveRoleTakenOn(jobIds[0], yesterday)).success).toBe(true);
    const data = await getAgencyReports();
    expect(data.firstSubmission).toMatchObject({
      rolesTakenOn: 1,
      measured: 1,
      medianDays: 0,
    });
    expect(data.roleCohort[0].takenOn).toBe(yesterday);
    expect((await saveRoleTakenOn(jobIds[0], "2026-02-30")).success).toBe(
      false,
    );
    expect((await saveRoleTakenOn(jobIds[0], "2099-01-01")).success).toBe(
      false,
    );
    expect((await saveRoleTakenOn(jobIds[3], yesterday)).success).toBe(false);
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "report-assigned",
    });
    expect((await saveRoleTakenOn(jobIds[0], today)).success).toBe(false);
    owner();
    expect((await saveRoleTakenOn(jobIds[0], null)).success).toBe(true);
    expect((await getAgencyReports()).firstSubmission.rolesTakenOn).toBe(0);
  });
  it("enforces assigned-job and department/region policies on data and options", async () => {
    for (const roleKey of ["report-assigned", "report-department"]) {
      mocks.context.mockResolvedValue({
        organization: { id: workspaceId },
        user: { id: userId },
        roleKey,
      });
      const data = await getAgencyReports();
      expect(data.summary.applications).toBe(1);
      expect(data.options.jobs.map((row) => row.id)).toEqual([jobIds[0]]);
      expect((await getAgencyReports({ job: jobIds[1] })).records).toEqual([]);
    }
  });
  it("limits client job lists and filter options to accessible linked jobs", async () => {
    owner();
    expect((await listJobsWithStats(clientId)).map((job) => job.id)).toEqual([
      jobIds[0],
    ]);
    expect((await listJobsWithStats()).map((job) => job.id).sort()).toEqual(
      jobIds.slice(0, 2).sort(),
    );
    expect((await listTrashedJobs()).map((job) => job.id)).toEqual([jobIds[2]]);
    expect((await listJobsWithStats(clientId))[0].clientName).toBe(
      "Fictional report client",
    );
    for (const roleKey of ["job-assigned", "job-department"]) {
      mocks.context.mockResolvedValue({
        organization: { id: workspaceId },
        user: { id: userId },
        roleKey,
      });
      expect((await listJobsWithStats()).map((job) => job.id)).toEqual([
        jobIds[0],
      ]);
      expect(await listTrashedJobs()).toEqual([]);
    }
  });
  it("requires report permission and removes trashed candidates from totals", async () => {
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "no-reports",
    });
    await expect(getAgencyReports()).rejects.toThrow("permission");
    owner();
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(eq(candidates.id, candidateIds[0]));
    const data = await getAgencyReports();
    expect(data.summary).toMatchObject({
      applications: 1,
      submitted: 1,
      placements: 0,
      accepted: 0,
    });
  });
});
