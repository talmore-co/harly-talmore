import { beforeEach, describe, expect, it, vi } from "vitest";

// Rejection reasons are internal. These tests pin where updateApplicationStatus
// stores them, that reactivation clears them, and that nothing candidate- or
// integration-facing (webhooks, domain events, portal, email) receives them.

const mocks = vi.hoisted(() => ({
  transactionImpl: vi.fn(),
  getWorkspaceContext: vi.fn(),
  requirePermission: vi.fn(),
  emitWebhookEvent: vi.fn(),
  persistDomainEvent: vi.fn(),
  enqueueEmailOutbox: vi.fn(),
  processEmailOutbox: vi.fn(),
  applicationRows: [] as unknown[],
}));

vi.mock("@harly/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
    select: vi.fn(() => {
      const query: Record<string, unknown> = {};
      query.from = query.innerJoin = query.leftJoin = query.where = () => query;
      query.limit = async () => [];
      query.then = (resolve: (rows: unknown[]) => void) =>
        resolve(mocks.applicationRows);
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
  jobStages: { name: "jobStages.name", emailConfig: "jobStages.emailConfig" },
  applicationStageHistory: { table: "applicationStageHistory" },
  activityEvents: { table: "activityEvents" },
  candidatePortalNotifications: { table: "candidatePortalNotifications" },
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
  persistDomainEvent: mocks.persistDomainEvent,
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueueEmailOutbox,
  processEmailOutbox: mocks.processEmailOutbox,
}));

import { updateApplicationStatus } from "./actions";

const WORKSPACE_ID = "ws-1";

function applicationRow(status: string) {
  return {
    id: "app-1",
    candidateId: "cand-1",
    jobId: "job-1",
    currentStageId: "stage-current",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAtVersion: "2026-01-01 00:00:00+00",
    status,
    candidateEmail: "c@example.com",
    candidateFirstName: "Cand",
    candidateLastName: "Idate",
    jobTitle: "Engineer",
    workspaceName: "Acme",
  };
}

/** Records every `set` and `insert().values()` the action performs. */
function makeTx(stageRows: unknown[]) {
  const sets: Record<string, unknown>[] = [];
  const inserts: { table: unknown; values: unknown }[] = [];
  const selectBuilder: Record<string, unknown> = {};
  selectBuilder.from = selectBuilder.innerJoin = selectBuilder.where = selectBuilder.orderBy = () => selectBuilder;
  selectBuilder.limit = async () => stageRows;
  const tx = {
    select: () => selectBuilder,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        return { where: () => ({ returning: async () => [{ id: "app-1" }] }) };
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserts.push({ table, values });
        return [];
      },
    }),
  };
  return { tx, sets, inserts };
}

describe("rejection reason storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.persistDomainEvent.mockImplementation(async (_tx, event) => ({
      eventId: `event-${event.name}`,
    }));
    mocks.processEmailOutbox.mockResolvedValue({ processed: 0, sent: 0, failed: 0 });
    mocks.applicationRows = [applicationRow("active")];
  });

  it("refuses unknown reason codes and oversized notes before touching the database", async () => {
    const base = { applicationIds: ["app-1"], workspaceId: WORKSPACE_ID, status: "rejected" as const };
    expect(await updateApplicationStatus({ ...base, rejectionReason: "bad_vibes" })).toEqual({ success: false, error: "Invalid rejection reason." });
    expect((await updateApplicationStatus({ ...base, rejectionNote: "x".repeat(501) })).success).toBe(false);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.transactionImpl).not.toHaveBeenCalled();
  });

  it("refuses a reason on a status other than rejected", async () => {
    const result = await updateApplicationStatus({ applicationIds: ["app-1"], workspaceId: WORKSPACE_ID, status: "withdrawn", rejectionReason: "duplicate" });
    expect(result).toEqual({ success: false, error: "A rejection reason requires a rejected status." });
    expect(mocks.transactionImpl).not.toHaveBeenCalled();
  });

  it("stores the reason and note, logs the reason, and keeps both out of outbound payloads", async () => {
    const { tx, sets, inserts } = makeTx([{ id: "stage-rejected", name: "Rejected", emailConfig: null }]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await updateApplicationStatus({
      applicationIds: ["app-1"],
      workspaceId: WORKSPACE_ID,
      status: "rejected",
      sendRejectionEmail: true,
      rejectionReason: "salary_expectations",
      rejectionNote: "  Wants 20% above band  ",
    });

    expect(result.success).toBe(true);
    expect(sets[0]).toMatchObject({
      status: "rejected",
      rejectionSource: "agency",
      rejectionReason: "salary_expectations",
      rejectionNote: "Wants 20% above band",
    });
    const rejectedActivity = inserts
      .map((insert) => insert.values as { type?: string; metadata?: unknown })
      .find((values) => values.type === "application.rejected");
    expect(rejectedActivity?.metadata).toEqual({ status: "rejected", rejectionReason: "salary_expectations" });

    // Everything that can leave the workspace or reach the candidate.
    const outbound = JSON.stringify([
      mocks.emitWebhookEvent.mock.calls,
      mocks.persistDomainEvent.mock.calls.map(([, event]) => event),
      mocks.enqueueEmailOutbox.mock.calls,
      inserts.filter((insert) => (insert.table as { table?: string }).table === "candidatePortalNotifications"),
    ]);
    expect(mocks.emitWebhookEvent).toHaveBeenCalled();
    expect(mocks.enqueueEmailOutbox).toHaveBeenCalledTimes(1);
    expect(outbound).not.toContain("salary_expectations");
    expect(outbound).not.toContain("above band");
    expect(outbound).not.toContain("rejectionReason");
    expect(outbound).not.toContain("rejectionNote");
  });

  it("rejects without a reason when none is given", async () => {
    const { tx, sets, inserts } = makeTx([{ id: "stage-rejected", name: "Rejected", emailConfig: null }]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await updateApplicationStatus({ applicationIds: ["app-1"], workspaceId: WORKSPACE_ID, status: "rejected" });

    expect(result.success).toBe(true);
    expect(sets[0]).toMatchObject({ status: "rejected", rejectionReason: null, rejectionNote: null });
    const rejectedActivity = inserts
      .map((insert) => insert.values as { type?: string; metadata?: unknown })
      .find((values) => values.type === "application.rejected");
    expect(rejectedActivity?.metadata).toEqual({ status: "rejected" });
  });

  it("clears the reason and note when a rejected application is reactivated", async () => {
    mocks.applicationRows = [applicationRow("rejected")];
    const { tx, sets } = makeTx([{ id: "stage-current", name: "Interview", emailConfig: null }]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await updateApplicationStatus({ applicationIds: ["app-1"], workspaceId: WORKSPACE_ID, status: "active" });

    expect(result.success).toBe(true);
    expect(sets[0]).toMatchObject({ status: "active", rejectionSource: null, rejectionReason: null, rejectionNote: null });
  });
});
