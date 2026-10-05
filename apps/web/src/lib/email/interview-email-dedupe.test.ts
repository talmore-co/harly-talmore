import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the real enqueueEmailOutbox against an in-memory model of
 * `email_outbox_workspace_dedupe_uidx` (workspace, dedupe key) to show which
 * interview emails collapse into an existing row and which do not.
 */

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; workspaceId: string; dedupeKey: string }>,
  conflictId: null as string | null,
}));

vi.mock("@harly/db", () => ({
  db: {
    insert: () => ({
      values: (row: { workspaceId: string; dedupeKey: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const conflict = state.rows.find(
              (existing) =>
                existing.workspaceId === row.workspaceId &&
                existing.dedupeKey === row.dedupeKey,
            );
            if (conflict) {
              state.conflictId = conflict.id;
              return [];
            }
            const created = { id: `outbox-${state.rows.length + 1}`, ...row };
            state.rows.push(created);
            return [{ id: created.id }];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          // Only reached after a conflict: resolves to the existing row.
          limit: async () => [{ id: state.conflictId }],
        }),
      }),
    }),
  },
  emailOutbox: {},
  activityEvents: {},
  applications: {},
  candidates: {},
  documentAssociations: {},
  documents: {},
  offers: {},
  organization: {},
}));
vi.mock("@/lib/email", () => ({ sendWorkspaceEmail: vi.fn() }));
vi.mock("@/lib/email/branding", () => ({ getWorkspaceEmailBranding: vi.fn() }));
vi.mock("@/lib/email/config", () => ({ getWorkspaceEmailConfig: vi.fn() }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: vi.fn() }));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { interviewEmailDedupeKey } from "./interview-email-dedupe";
import { enqueueEmailOutbox } from "./outbox-processor";

const SLOT_A = "2099-01-01T10:00:00.000Z";
const SLOT_B = "2099-01-02T10:00:00.000Z";

function payload(scheduledAt: string) {
  return {
    candidateEmail: "candidate@example.com",
    companyName: "Acme",
    jobTitle: "Engineer",
    scheduledAt,
  };
}

function enqueue(kind: string, scheduledAt: string, actionId?: string) {
  return enqueueEmailOutbox(
    "ws-1",
    kind,
    payload(scheduledAt),
    interviewEmailDedupeKey({ kind, interviewId: "iv-1", actionId }),
  );
}

describe("interview email outbox dedupe", () => {
  beforeEach(() => {
    state.rows.length = 0;
    state.conflictId = null;
  });

  it("queues every reschedule when a slot is announced for the second time", async () => {
    const ids = [
      await enqueue("interview.rescheduled", SLOT_B, "event-1"),
      await enqueue("interview.rescheduled", SLOT_A, "event-2"),
      await enqueue("interview.rescheduled", SLOT_B, "event-3"),
    ];

    expect(new Set(ids).size).toBe(3);
    expect(state.rows).toHaveLength(3);
  });

  it("queues a confirmation when a canceled slot is booked again", async () => {
    const first = await enqueue("interview.scheduled", SLOT_A, "event-1");
    await enqueue("interview.canceled", SLOT_A, "event-2");
    const rebooked = await enqueue("interview.scheduled", SLOT_A, "event-3");

    expect(rebooked).not.toBe(first);
    expect(state.rows).toHaveLength(3);
  });

  it("still collapses a double enqueue of the same action", async () => {
    const first = await enqueue("interview.rescheduled", SLOT_B, "event-1");
    const again = await enqueue("interview.rescheduled", SLOT_B, "event-1");

    expect(again).toBe(first);
    expect(state.rows).toHaveLength(1);
  });

  it("documents the payload-hash fallback that the action key replaces", async () => {
    const first = await enqueue("interview.rescheduled", SLOT_B);
    await enqueue("interview.rescheduled", SLOT_A);
    const repeated = await enqueue("interview.rescheduled", SLOT_B);

    // Same payload, no action id: the third email resolves to the first row.
    expect(repeated).toBe(first);
    expect(state.rows).toHaveLength(2);
  });

  it("builds no key without an action id", () => {
    expect(
      interviewEmailDedupeKey({ kind: "interview.scheduled", interviewId: "iv-1" }),
    ).toBeUndefined();
    expect(
      interviewEmailDedupeKey({
        kind: "interview.scheduled",
        interviewId: "iv-1",
        actionId: "event-1",
      }),
    ).toBe("interview-email:interview.scheduled:iv-1:event-1");
  });
});
