import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { applications, candidates, customRoles, db, jobHiringTeam, jobs, jobStages, organization, tasks, user } from "@harly/db";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.context }));
import { listTasks } from "./data";

const integration = process.env.RUN_TASKS_INTEGRATION === "1" ? describe : describe.skip;
integration("application task isolation", () => {
  const workspaceId = `tasks-${randomUUID()}`, otherWorkspaceId = `tasks-${randomUUID()}`, userId = randomUUID();
  const candidateId = randomUUID(), otherCandidateId = randomUUID();
  const jobIds = Array.from({ length: 3 }, () => randomUUID()), appIds = jobIds.map(() => randomUUID());
  const taskIds = jobIds.map(() => randomUUID());
  const context = (roleKey = "owner") => mocks.context.mockResolvedValue({ organization: { id: workspaceId }, user: { id: userId }, roleKey });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/harly_talmore_eval") throw new Error("Use local evaluation database");
    await db.insert(organization).values([workspaceId, otherWorkspaceId].map((id) => ({ id, slug: id, name: "Fictional task workspace", createdAt: new Date() })));
    await db.insert(user).values({ id: userId, name: "Fictional task owner", email: `${userId}@example.test` });
    await db.insert(candidates).values([{ id: candidateId, workspaceId }, { id: otherCandidateId, workspaceId: otherWorkspaceId }].map((value) => ({ ...value, firstName: "Fictional", lastName: "Task candidate", email: `${value.id}@example.test` })));
    for (let i = 0; i < 3; i++) {
      const ws = i === 2 ? otherWorkspaceId : workspaceId, cid = i === 2 ? otherCandidateId : candidateId, stageId = randomUUID();
      await db.insert(jobs).values({ id: jobIds[i], workspaceId: ws, createdById: userId, title: `Fictional task role ${i}`, slug: jobIds[i], employmentType: "full_time", workplaceType: "onsite", description: "Fixture", status: "open" });
      await db.insert(jobStages).values({ id: stageId, workspaceId: ws, jobId: jobIds[i], name: "Applied", order: 0 });
      await db.insert(applications).values({ id: appIds[i], workspaceId: ws, candidateId: cid, jobId: jobIds[i], currentStageId: stageId });
      await db.insert(tasks).values({ id: taskIds[i], workspaceId: ws, candidateId: cid, applicationId: appIds[i], jobId: jobIds[i], ownerId: userId, createdById: userId, title: `Task for role ${i}`, status: i === 1 ? "completed" : "pending" });
    }
    await db.insert(tasks).values([
      { workspaceId, candidateId, ownerId: userId, createdById: userId, title: "Candidate-only task" },
      { workspaceId, candidateId, applicationId: appIds[0], jobId: jobIds[0], ownerId: userId, createdById: userId, title: "Archived task", deletedAt: new Date() },
    ]);
    await db.insert(customRoles).values([
      { workspaceId, key: "assigned-tasks", name: "Assigned task reader", permissions: ["tasks:read", "candidates:view"], scope: { jobAccess: "assigned" } },
      { workspaceId, key: "no-tasks", name: "No tasks", permissions: ["candidates:view"] },
    ]);
    await db.insert(jobHiringTeam).values({ workspaceId, jobId: jobIds[0], userId });
  });
  afterAll(async () => {
    await db.delete(organization).where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("separates two applications for one candidate and includes completed history", async () => {
    context();
    expect((await listTasks({ applicationIds: [appIds[0]] })).map((task) => task.id)).toEqual([taskIds[0]]);
    expect((await listTasks({ applicationIds: [appIds[1]] })).map((task) => [task.id, task.status])).toEqual([[taskIds[1], "completed"]]);
    expect(await listTasks({ applicationIds: [] })).toEqual([]);
  });
  it("rejects other-workspace and unassigned applications", async () => {
    context();
    await expect(listTasks({ applicationIds: [appIds[2]] })).rejects.toThrow();
    context("assigned-tasks");
    expect((await listTasks({ applicationIds: [appIds[0]] })).map((task) => task.id)).toEqual([taskIds[0]]);
    await expect(listTasks({ applicationIds: [appIds[1]] })).rejects.toThrow();
  });
  it("requires task read permission", async () => {
    context("no-tasks");
    await expect(listTasks({ applicationIds: [appIds[0]] })).rejects.toThrow("permission");
  });
});
