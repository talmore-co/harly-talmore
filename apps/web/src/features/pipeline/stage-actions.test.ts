import { beforeEach, describe, expect, it, vi } from "vitest";

// Stage editing is job editing: every action must pass the job-scoped
// permission check before it reads or writes a stage, and must leave `order`
// contiguous (1..n) without ever colliding with the unique (job, order) index.

const mocks = vi.hoisted(() => ({
  requireJobPermission: vi.fn(),
  transaction: vi.fn(),
  listJobStagesForApi: vi.fn(),
  updateJobStageForApi: vi.fn(),
  stages: [] as { id: string; name: string; order: number }[],
  counts: [] as number[],
  orderWrites: [] as number[],
  inserted: [] as Record<string, unknown>[],
  deletes: 0,
}));

vi.mock("@harly/db", () => ({
  db: { transaction: mocks.transaction },
  applications: {},
  applicationStageHistory: {},
  jobStages: {},
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission: mocks.requireJobPermission,
}));
vi.mock("@/features/pipeline/service", () => ({
  listJobStagesForApi: mocks.listJobStagesForApi,
  updateJobStageForApi: mocks.updateJobStageForApi,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createJobStage,
  deleteJobStage,
  renameJobStage,
  reorderJobStages,
} from "./stage-actions";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `22222222-2222-4222-8222-00000000000${n}`;
const NEW_ID = "33333333-3333-4333-8333-333333333333";

function makeTx() {
  const stageQuery: Record<string, unknown> = {};
  stageQuery.from = stageQuery.where = stageQuery.orderBy = () => stageQuery;
  // Locked stage read ends in `.for("update")`; count reads are awaited directly.
  stageQuery.for = async () => mocks.stages;
  stageQuery.then = (resolve: (rows: unknown[]) => void) =>
    resolve([{ value: mocks.counts.shift() ?? 0 }]);

  return {
    select: () => stageQuery,
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserted.push(values);
        return { returning: async () => [{ id: NEW_ID }] };
      },
    }),
    update: () => ({
      set: (values: { order: number }) => {
        mocks.orderWrites.push(values.order);
        return { where: async () => undefined };
      },
    }),
    delete: () => ({
      where: async () => {
        mocks.deletes += 1;
      },
    }),
  };
}

const defaultStages = () => [
  { id: id(1), name: "Applied", order: 1 },
  { id: id(2), name: "Screening", order: 2 },
  { id: id(3), name: "Hired", order: 3 },
  { id: id(4), name: "Rejected", order: 4 },
];

describe("pipeline stage actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stages = defaultStages();
    mocks.counts = [];
    mocks.orderWrites = [];
    mocks.inserted = [];
    mocks.deletes = 0;
    mocks.requireJobPermission.mockResolvedValue({
      organization: { id: "workspace-1" },
    });
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
    );
    mocks.listJobStagesForApi.mockImplementation(async () => mocks.stages);
  });

  const actions = [
    ["create", () => createJobStage({ jobId: JOB_ID, name: "Offer" })],
    ["rename", () => renameJobStage({ jobId: JOB_ID, stageId: id(2), name: "Phone screen" })],
    ["reorder", () => reorderJobStages({ jobId: JOB_ID, orderedStageIds: [id(2), id(1), id(3), id(4)] })],
    ["delete", () => deleteJobStage({ jobId: JOB_ID, stageId: id(2) })],
  ] as const;

  it.each(actions)("requires job-edit access before %s", async (_name, action) => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    await expect(action()).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Unable"),
    });
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.listJobStagesForApi).not.toHaveBeenCalled();
    expect(mocks.updateJobStageForApi).not.toHaveBeenCalled();
  });

  it("rejects malformed ids before any permission or database work", async () => {
    await expect(
      createJobStage({ jobId: "not-a-uuid", name: "Offer" }),
    ).resolves.toEqual({ success: false, error: "Invalid stage request." });
    await expect(
      deleteJobStage({ jobId: JOB_ID, stageId: "1; drop table" }),
    ).resolves.toEqual({ success: false, error: "Invalid stage request." });
    expect(mocks.requireJobPermission).not.toHaveBeenCalled();
  });

  it("adds a stage before the outcome stages and keeps order contiguous", async () => {
    await expect(
      createJobStage({ jobId: JOB_ID, name: "  Offer " }),
    ).resolves.toEqual({ success: true });

    expect(mocks.inserted).toEqual([
      { workspaceId: "workspace-1", jobId: JOB_ID, name: "Offer", order: 5 },
    ]);
    // Five stages: placeholders below every existing order, then 1..5.
    expect(mocks.orderWrites).toEqual([-6, -7, -8, -9, -10, 1, 2, 3, 4, 5]);
  });

  it("returns the validation message for a duplicate stage name", async () => {
    await expect(
      createJobStage({ jobId: JOB_ID, name: "screening" }),
    ).resolves.toEqual({
      success: false,
      error: 'This job already has a "screening" stage.',
    });
    expect(mocks.inserted).toEqual([]);
  });

  it("renames a working stage through the stage service", async () => {
    await expect(
      renameJobStage({ jobId: JOB_ID, stageId: id(2), name: "Phone screen" }),
    ).resolves.toEqual({ success: true });
    expect(mocks.updateJobStageForApi).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      jobId: JOB_ID,
      stageId: id(2),
      patch: { name: "Phone screen" },
    });
  });

  it("refuses to rename an outcome stage", async () => {
    const result = await renameJobStage({
      jobId: JOB_ID,
      stageId: id(3),
      name: "Placed",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot be renamed/);
    expect(mocks.updateJobStageForApi).not.toHaveBeenCalled();
  });

  it("reorders through placeholders so the unique order index never collides", async () => {
    await expect(
      reorderJobStages({
        jobId: JOB_ID,
        orderedStageIds: [id(2), id(1), id(3), id(4)],
      }),
    ).resolves.toEqual({ success: true });
    expect(mocks.orderWrites).toEqual([-5, -6, -7, -8, 1, 2, 3, 4]);
  });

  it("does not write when the order is unchanged", async () => {
    await reorderJobStages({
      jobId: JOB_ID,
      orderedStageIds: [id(1), id(2), id(3), id(4)],
    });
    expect(mocks.orderWrites).toEqual([]);
  });

  it("rejects an order that does not match the job's stages", async () => {
    const result = await reorderJobStages({
      jobId: JOB_ID,
      orderedStageIds: [id(1), id(2), id(3)],
    });
    expect(result).toEqual({
      success: false,
      error: "The stages changed. Refresh and try again.",
    });
    expect(mocks.orderWrites).toEqual([]);
  });

  it("deletes an unused stage and closes the gap in order", async () => {
    mocks.counts = [0, 0];
    await expect(
      deleteJobStage({ jobId: JOB_ID, stageId: id(2) }),
    ).resolves.toEqual({ success: true });
    expect(mocks.deletes).toBe(1);
    expect(mocks.orderWrites).toEqual([-5, -6, -7, 1, 2, 3]);
  });

  it("keeps a stage that still holds applications", async () => {
    mocks.counts = [3, 0];
    const result = await deleteJobStage({ jobId: JOB_ID, stageId: id(2) });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Move the 3 candidates/);
    expect(mocks.deletes).toBe(0);
  });

  it("keeps a stage that appears in stage history", async () => {
    mocks.counts = [0, 4];
    const result = await deleteJobStage({ jobId: JOB_ID, stageId: id(2) });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/history/);
    expect(mocks.deletes).toBe(0);
  });

  it("never deletes an outcome stage", async () => {
    mocks.counts = [0, 0];
    const result = await deleteJobStage({ jobId: JOB_ID, stageId: id(4) });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot be deleted/);
    expect(mocks.deletes).toBe(0);
  });
});
