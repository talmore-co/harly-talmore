import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@harly/api";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireApplicationPermission: vi.fn(),
  existingApplicationId: null as string | null,
  assertTaskReferences: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              ownerId: "u1",
              candidateId: null,
              applicationId: mocks.existingApplicationId,
              jobId: null,
              interviewId: null,
            },
          ],
        }),
      }),
    })),
    transaction: mocks.dbTransaction,
    insert: vi.fn(() => ({ values: () => ({ returning: async () => [{ id: "x" }] }) })),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: async () => [{ id: "x", ownerId: "u1" }] }) }),
    })),
    delete: vi.fn(() => ({ where: () => ({ returning: async () => [{ id: "x" }] }) })),
  },
  tasks: {},
  activityEvents: {},
  notifications: {},
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireApplicationPermission: mocks.requireApplicationPermission,
}));
vi.mock("./service", () => ({
  assertTaskReferences: mocks.assertTaskReferences,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createTask, deleteTask, updateTask } from "./actions";

describe("Tasks actions , RBAC (F2-04 / readiness)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existingApplicationId = null;
    mocks.requireApplicationPermission.mockResolvedValue(undefined);
    mocks.assertTaskReferences.mockResolvedValue(undefined);
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "u1", name: "U" },
    });
    mocks.dbTransaction.mockImplementation(async (callback) =>
      callback({
        insert: vi.fn(() => ({
          values: () => ({ returning: async () => [{ id: "x" }] }),
        })),
        update: vi.fn(() => ({
          set: () => ({
            where: () => ({ returning: async () => [{ id: "x", ownerId: "u1" }] }),
          }),
        })),
      }),
    );
  });

  it.each([
    ["createTask", () => createTask({ title: "T", ownerId: "u2" })],
    ["updateTask", () => updateTask({ taskId: "55555555-5555-4555-8555-555555555555", title: "T2" })],
    ["deleteTask", () => deleteTask("x")],
  ])("%s requires tasks:write", async (_name, run) => {
    await run();
    expect(mocks.requirePermission).toHaveBeenCalledWith("tasks:write");
  });

  it("blocks the action when the caller lacks permission", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("no permission"));
    const result = await createTask({ title: "T", ownerId: "u2" });
    expect(result.success).toBe(false);
  });

  it("validates the owner and every linked record before creating a task", async () => {
    await createTask({
      title: "T",
      ownerId: "u2",
      candidateId: "11111111-1111-4111-8111-111111111111",
      applicationId: "22222222-2222-4222-8222-222222222222",
      jobId: "33333333-3333-4333-8333-333333333333",
      interviewId: "44444444-4444-4444-8444-444444444444",
    });

    expect(mocks.assertTaskReferences).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ownerId: "u2",
      links: {
        candidateId: "11111111-1111-4111-8111-111111111111",
        applicationId: "22222222-2222-4222-8222-222222222222",
        jobId: "33333333-3333-4333-8333-333333333333",
        interviewId: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith("candidates:view", "22222222-2222-4222-8222-222222222222");
  });

  it("blocks creating tasks for an inaccessible application", async () => {
    mocks.requireApplicationPermission.mockRejectedValue(new Error("No application access"));
    const result = await createTask({ title: "Follow up", ownerId: "u1", applicationId: "22222222-2222-4222-8222-222222222222" });
    expect(result.success).toBe(false);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });

  it("blocks completing tasks on an inaccessible application even without link changes", async () => {
    mocks.existingApplicationId = "22222222-2222-4222-8222-222222222222";
    mocks.requireApplicationPermission.mockRejectedValue(new Error("No application access"));
    const result = await updateTask({ taskId: "55555555-5555-4555-8555-555555555555", status: "completed" });
    expect(result.success).toBe(false);
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith("candidates:view", mocks.existingApplicationId);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });

  it("returns the validation error instead of attempting a task insert", async () => {
    mocks.assertTaskReferences.mockRejectedValue(
      ApiError.unprocessable("Candidate does not belong to this workspace."),
    );

    const result = await createTask({ title: "T", ownerId: "u2" });

    expect(result).toEqual({
      success: false,
      error: "Candidate does not belong to this workspace.",
    });
  });

  it("validates a reassigned owner before updating the task", async () => {
    mocks.assertTaskReferences.mockRejectedValue(
      ApiError.unprocessable("Task owner must be a member of this workspace."),
    );

    const result = await updateTask({
      taskId: "55555555-5555-4555-8555-555555555555",
      ownerId: "outside-workspace-user",
    });

    expect(result).toEqual({
      success: false,
      error: "Task owner must be a member of this workspace.",
    });
  });
});
