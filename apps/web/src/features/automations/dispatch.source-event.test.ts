import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One domain event reaches the dispatcher twice: once from the synchronous
 * fast path (emitWebhookEvent) and once from the domain-event outbox consumer.
 * This models `workflow_runs_source_event_uidx` (workspace, workflow, source
 * event id; NULLs never conflict) to prove the pair collapses into one run
 * only when both carry the same source event id.
 */

const state = vi.hoisted(() => ({
  runs: [] as Array<{ id: string; workflowId: string; sourceEventId: string | null }>,
  runWorkflow: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("server-only", () => ({}));

vi.mock("@harly/db", () => {
  const workflows = [
    {
      id: "wf-1",
      trigger: { runtimeVersion: 2 },
      definitionVersion: 1,
      maxRunsPerMinute: 100,
      circuitOpenUntil: null,
      publishedAt: null,
    },
  ];
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            // Awaited directly: workflow lookup / rate-limit count.
            // With .orderBy().limit(): anti-loop lookup. Runs have finished,
            // so no run is still "running".
            const thenable = Promise.resolve(workflows) as Promise<unknown> & {
              orderBy?: () => { limit: () => Promise<unknown[]> };
            };
            thenable.orderBy = () => ({ limit: () => Promise.resolve([]) });
            return thenable;
          },
        }),
      }),
      insert: () => ({
        values: (row: { workflowId: string; sourceEventId: string | null }) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              const conflict =
                row.sourceEventId !== null &&
                state.runs.some(
                  (run) =>
                    run.workflowId === row.workflowId &&
                    run.sourceEventId === row.sourceEventId,
                );
              if (conflict) return [];
              const run = {
                id: `run-${state.runs.length + 1}`,
                workflowId: row.workflowId,
                sourceEventId: row.sourceEventId,
              };
              state.runs.push(run);
              return [{ id: run.id }];
            },
          }),
        }),
      }),
    },
    domainEventOutbox: {},
    workflowDefinitions: {},
    workflowRuns: {},
  };
});

vi.mock("./engine", () => {
  state.runWorkflow = vi.fn().mockResolvedValue({ status: "succeeded" });
  return { runWorkflow: state.runWorkflow };
});
vi.mock("./status", () => ({ AUTOMATIONS_ENABLED: true }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { dispatchWorkflowEvent } from "./dispatch";

const payload = { application: { id: "app-1", jobId: "job-1" } };

describe("workflow dispatch per domain event", () => {
  beforeEach(() => {
    state.runs.length = 0;
    state.runWorkflow.mockClear();
  });

  it("runs a workflow once when the fast path and the outbox consumer share the event id", async () => {
    await dispatchWorkflowEvent("ws-1", "application.created", payload, {
      sourceEventId: "event-1",
    });
    await dispatchWorkflowEvent("ws-1", "application.created", payload, {
      sourceEventId: "event-1",
      occurredAt: new Date(),
    });

    expect(state.runs).toHaveLength(1);
    expect(state.runWorkflow).toHaveBeenCalledTimes(1);
  });

  it("cannot deduplicate a fast-path run that has no source event id", async () => {
    // This is why emitWebhookEvent never dispatches without the persisted id.
    await dispatchWorkflowEvent("ws-1", "application.created", payload);
    await dispatchWorkflowEvent("ws-1", "application.created", payload, {
      sourceEventId: "event-1",
    });

    expect(state.runs).toHaveLength(2);
    expect(state.runWorkflow).toHaveBeenCalledTimes(2);
  });
});
