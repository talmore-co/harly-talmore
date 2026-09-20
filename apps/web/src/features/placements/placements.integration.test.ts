import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  applications,
  applicationStageHistory,
  candidates,
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
import { listPlacements } from "./data";

const integration =
  process.env.RUN_PLACEMENTS_INTEGRATION === "1" ? describe : describe.skip;
integration("placement directory scope and history", () => {
  const workspaceId = `placements-${randomUUID()}`,
    otherWorkspaceId = `placements-${randomUUID()}`,
    userId = randomUUID();
  const appIds = Array.from({ length: 5 }, () => randomUUID()),
    jobIds = appIds.map(() => randomUUID()),
    candidateIds = appIds.map(() => randomUUID());
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
    await db
      .insert(organization)
      .values(
        [workspaceId, otherWorkspaceId].map((id) => ({
          id,
          slug: id,
          name: "Fictional placement workspace",
          createdAt: new Date(),
        })),
      );
    await db
      .insert(user)
      .values({
        id: userId,
        name: "Fictional placement reader",
        email: `${userId}@example.test`,
      });
    for (let i = 0; i < 5; i++) {
      const ws = i === 4 ? otherWorkspaceId : workspaceId,
        stageId = randomUUID();
      await db
        .insert(jobs)
        .values({
          id: jobIds[i],
          workspaceId: ws,
          createdById: userId,
          title: `Fictional placement role ${i}`,
          slug: jobIds[i],
          employmentType: "full_time",
          workplaceType: "onsite",
          description: "Fixture",
          status: "closed",
          department: i === 0 ? "Operations" : "Other",
          jobLocationRegion: "PH",
          deletedAt: i === 3 ? new Date() : null,
        });
      await db
        .insert(jobStages)
        .values({
          id: stageId,
          workspaceId: ws,
          jobId: jobIds[i],
          name: "Hired",
          order: 0,
        });
      await db
        .insert(candidates)
        .values({
          id: candidateIds[i],
          workspaceId: ws,
          firstName: "Fictional",
          lastName: `Placement ${i}`,
          email: `${candidateIds[i]}@example.test`,
        });
      await db
        .insert(applications)
        .values({
          id: appIds[i],
          workspaceId: ws,
          candidateId: candidateIds[i],
          jobId: jobIds[i],
          currentStageId: stageId,
          status: i === 1 ? "active" : "hired",
          hiredOn: i === 0 ? "2026-09-15" : null,
        });
      if (i !== 2)
        await db
          .insert(applicationStageHistory)
          .values(
            ["2026-09-01T23:30:00Z", "2026-09-10T10:00:00Z"].map((date) => ({
              workspaceId: ws,
              applicationId: appIds[i],
              toStageId: stageId,
              createdAt: new Date(date),
            })),
          );
    }
    await db.insert(customRoles).values([
      {
        workspaceId,
        key: "assigned-placement",
        name: "Assigned",
        permissions: ["candidates:view"],
        scope: { jobAccess: "assigned" },
      },
      {
        workspaceId,
        key: "department-placement",
        name: "Department",
        permissions: ["candidates:view"],
        scope: {
          jobAccess: "all",
          departments: ["operations"],
          regions: ["ph"],
        },
      },
      { workspaceId, key: "no-placement", name: "No access", permissions: [] },
    ]);
    await db
      .insert(jobHiringTeam)
      .values({ workspaceId, jobId: jobIds[0], userId });
  });
  afterAll(async () => {
    await db
      .delete(organization)
      .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("uses explicit or first historical date and retains reopened/unknown-date placements", async () => {
    context();
    const rows = await listPlacements();
    expect(rows.map((row) => [row.id, row.hiredOn, row.status])).toEqual([
      [appIds[0], "2026-09-15", "hired"],
      [appIds[1], "2026-09-01", "active"],
      [appIds[2], null, "hired"],
    ]);
  });
  it("restricts assigned and department/region scopes", async () => {
    for (const role of ["assigned-placement", "department-placement"]) {
      context(role);
      expect((await listPlacements()).map((row) => row.id)).toEqual([
        appIds[0],
      ]);
    }
  });
  it("requires candidate access and excludes trashed candidates", async () => {
    context("no-placement");
    await expect(listPlacements()).rejects.toThrow("permission");
    context();
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(eq(candidates.id, candidateIds[0]));
    expect((await listPlacements()).map((row) => row.id)).not.toContain(
      appIds[0],
    );
  });
});
