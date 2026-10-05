import { beforeEach, describe, expect, it, vi } from "vitest";

// A drop on the board is not a status decision. These tests drive
// `moveApplicationInPipeline` through a recording transaction to pin down what
// a drag may write: the status rule, and which rows get a new `updatedAt`.

const mocks = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
  getWorkspaceContext: vi.fn(),
  requirePermission: vi.fn(),
  emitWebhookEvent: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
    select: vi.fn(() => {
      const query: Record<string, unknown> = {};
      query.from = query.where = () => query;
      query.limit = async () => [];
      return query;
    }),
  },
  applications: {
    id: "applications.id",
    jobId: "applications.jobId",
    workspaceId: "applications.workspaceId",
    currentStageId: "applications.currentStageId",
    updatedAt: "applications.updatedAt",
  },
  candidates: {},
  jobs: {},
  organization: {},
  jobStages: { id: "jobStages.id", name: "jobStages.name" },
  applicationStageHistory: {},
  activityEvents: {},
  candidatePortalNotifications: {},
  workspaceSettings: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireApplicationPermission: mocks.requirePermission,
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(async () => ({ eventId: "event-1" })),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(),
  processEmailOutbox: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { moveApplicationInPipeline } from "./actions";

const WORKSPACE_ID = "ws-1";

type Row = {
  status: "active" | "hired" | "rejected" | "withdrawn";
  currentStageId: string;
  toStageName: string;
};

function makeTx(row: Row, fromStageName: string) {
  const writes: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  let selects = 0;

  const tx = {
    select: () => {
      selects += 1;
      // First read: the application joined to its target stage. Second read
      // (only for non-active applications that change stage): the stage it left.
      const rows =
        selects === 1
          ? [
              {
                id: "app-1",
                candidateId: "cand-1",
                updatedAtVersion: "2024-01-01 00:00:00+00",
                candidateEmail: "c@example.com",
                candidateFirstName: "Cand",
                candidateLastName: "Idate",
                jobTitle: "Engineer",
                workspaceName: "Acme",
                toStageEmailConfig: { candidateUpdatesEnabled: false },
                ...row,
              },
            ]
          : [{ name: fromStageName }];
      const query: Record<string, unknown> = {};
      query.from = query.innerJoin = query.where = query.limit = () => query;
      query.then = (resolve: (value: unknown) => void) => resolve(rows);
      return query;
    },
    update: () => {
      const builder: Record<string, unknown> = {};
      builder.set = (values: Record<string, unknown>) => {
        writes.push(values);
        return builder;
      };
      builder.where = () => builder;
      builder.returning = async () => [{ id: "app-1" }];
      return builder;
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return { then: (resolve: (value: unknown) => void) => resolve([]) };
      },
    }),
  };

  return { tx, writes, inserts, selectCount: () => selects };
}

async function move(
  row: Row,
  options: { toStageId: string; fromStageName?: string; ordered?: string[] },
) {
  const recorder = makeTx(row, options.fromStageName ?? "Screening");
  mocks.transactionImpl.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(recorder.tx),
  );
  const result = await moveApplicationInPipeline({
    applicationId: "app-1",
    fromStageId: row.currentStageId,
    toStageId: options.toStageId,
    workspaceId: WORKSPACE_ID,
    orderedApplicationIds: options.ordered ?? ["app-1"],
  });
  return { result, ...recorder };
}

describe("pipeline move status and timestamps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
  });

  it.each(["withdrawn", "rejected"] as const)(
    "leaves a %s application untouched when it is dropped in its own column",
    async (status) => {
      const { result, writes, inserts, selectCount } = await move(
        { status, currentStageId: "stage-interview", toStageName: "Interview" },
        { toStageId: "stage-interview", ordered: ["app-2", "app-1"] },
      );

      expect(result.success).toBe(true);
      expect(writes[0]).toMatchObject({ status, currentStageId: "stage-interview" });
      expect(writes[0]).not.toHaveProperty("rejectionSource");
      // No stage history, activity or notification for a reorder.
      expect(inserts).toEqual([]);
      expect(selectCount()).toBe(1);
      expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
    },
  );

  it("keeps a withdrawn application withdrawn when it moves between working stages", async () => {
    const { result, writes, inserts } = await move(
      { status: "withdrawn", currentStageId: "stage-screening", toStageName: "Interview" },
      { toStageId: "stage-interview", fromStageName: "Screening" },
    );

    expect(result.success).toBe(true);
    expect(writes[0]).toMatchObject({ status: "withdrawn" });
    expect(writes[0]).not.toHaveProperty("rejectionSource");
    // The stage change itself is still recorded, with the unchanged status.
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).toMatchObject({
      type: "stage.changed",
      metadata: { status: "withdrawn" },
    });
    expect(mocks.emitWebhookEvent).toHaveBeenCalledTimes(1);
    expect(mocks.emitWebhookEvent.mock.calls[0]?.[2]).toMatchObject({
      status: "withdrawn",
    });
  });

  it("reactivates a rejected application dragged out of the Rejected stage", async () => {
    const { writes, inserts } = await move(
      { status: "rejected", currentStageId: "stage-rejected", toStageName: "Interview" },
      { toStageId: "stage-interview", fromStageName: "Rejected" },
    );

    expect(writes[0]).toMatchObject({ status: "active", rejectionSource: null });
    expect(inserts.at(-1)).toMatchObject({ type: "application.active" });
  });

  it("rejects with the stage's source when moved into Rejected by client", async () => {
    const { writes } = await move(
      { status: "active", currentStageId: "stage-interview", toStageName: "Rejected by client" },
      { toStageId: "stage-rejected-client" },
    );

    expect(writes[0]).toMatchObject({
      status: "rejected",
      rejectionSource: "client",
    });
  });

  it("stamps updatedAt on the moved application only", async () => {
    const { writes } = await move(
      { status: "active", currentStageId: "stage-screening", toStageName: "Interview" },
      { toStageId: "stage-interview", ordered: ["app-2", "app-1", "app-3"] },
    );

    // One guarded write for the moved application, then one order write per card.
    expect(writes).toHaveLength(4);
    expect(writes[0].updatedAt).toBeInstanceOf(Date);
    expect(writes.slice(1).map((write) => write.pipelineOrder)).toEqual([1, 2, 3]);
    for (const write of writes.slice(1)) {
      // Pinned to the column itself (a SQL reference), so `$onUpdate` cannot
      // replace it with the current time.
      expect(write).toHaveProperty("updatedAt");
      expect(write.updatedAt).not.toBeInstanceOf(Date);
    }
  });
});
