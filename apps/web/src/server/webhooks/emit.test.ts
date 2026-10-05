import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * emitWebhookEvent is the fast path into workflow automations. The domain
 * event outbox consumer dispatches the same persisted event again with its
 * real id, and only `workflow_runs(workspace, workflow, source_event_id)`
 * makes that second dispatch a no-op. So the fast path must always carry the
 * persisted event id, or stand down.
 */

const mocks = vi.hoisted(() => ({
  dispatchWorkflowEvent: vi.fn(),
  emitDomainEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
  webhookEndpoints: {},
  webhookDeliveries: {},
}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
}));
vi.mock("./dispatch", () => ({
  dispatchDueWebhooks: vi.fn(async () => undefined),
}));
vi.mock("@/server/notify/slack", () => ({
  notifySlackEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/notify/dispatch", () => ({
  notifyChatEvent: vi.fn(async () => undefined),
  notifyTelegramEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/notify/inbox", () => ({
  notifyInboxEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/notify/outlook", () => ({
  notifyOutlookEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/notify/zoom", () => ({
  notifyZoomEvent: vi.fn(async () => undefined),
}));
vi.mock("@/features/automations/dispatch", () => ({
  dispatchWorkflowEvent: mocks.dispatchWorkflowEvent,
}));
vi.mock("@/server/events/emit", () => ({
  emitDomainEvent: mocks.emitDomainEvent,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { emitWebhookEvent } from "./emit";

const payload = { application: { id: "app-1", jobId: "job-1" } };

describe("emitWebhookEvent workflow fast path", () => {
  beforeEach(() => {
    mocks.dispatchWorkflowEvent.mockReset();
    mocks.dispatchWorkflowEvent.mockResolvedValue(true);
    mocks.emitDomainEvent.mockReset();
    mocks.emitDomainEvent.mockResolvedValue({ eventId: "persisted-by-emit" });
  });

  it("dispatches with the caller's persisted event id", async () => {
    await emitWebhookEvent("ws-1", "application.created", payload, {
      skipDomainEvent: true,
      eventId: "event-1",
    });

    expect(mocks.emitDomainEvent).not.toHaveBeenCalled();
    expect(mocks.dispatchWorkflowEvent).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchWorkflowEvent).toHaveBeenCalledWith(
      "ws-1",
      "application.created",
      payload,
      expect.objectContaining({ sourceEventId: "event-1" }),
    );
  });

  it("leaves dispatch to the outbox consumer when the persisted id is unknown", async () => {
    await emitWebhookEvent("ws-1", "application.created", payload, {
      skipDomainEvent: true,
    });

    // A run without a source event id is not deduplicated against the
    // consumer's run for the same event, so the workflow would run twice.
    expect(mocks.dispatchWorkflowEvent).not.toHaveBeenCalled();
  });

  it("uses the id of the event it persists itself", async () => {
    await emitWebhookEvent("ws-1", "application.created", payload);

    expect(mocks.dispatchWorkflowEvent).toHaveBeenCalledWith(
      "ws-1",
      "application.created",
      payload,
      expect.objectContaining({ sourceEventId: "persisted-by-emit" }),
    );
  });

  it("still dispatches when its own domain event could not be persisted", async () => {
    mocks.emitDomainEvent.mockRejectedValue(new Error("outbox unavailable"));

    await emitWebhookEvent("ws-1", "application.created", payload);

    // No durable event exists, so the fast path is the only path.
    expect(mocks.dispatchWorkflowEvent).toHaveBeenCalledTimes(1);
  });
});
