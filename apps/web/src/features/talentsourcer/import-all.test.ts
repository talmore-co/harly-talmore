import { describe, expect, it, vi } from "vitest";
import { importAllPages, type ImportRow } from "./import-all";

const row = (id: string, status: string, candidateId: string | null = null, reason: string | null = null): ImportRow => ({ id, name: id, status, reason, candidateId });
const pages = [
  { ok: true as const, batchId: "b1", rows: [row("a", "ready"), row("b", "skipped", "c-b", "Already in this job's pipeline"), row("c", "skipped", null, "No access")], continueCursor: "p2", isDone: false },
  { ok: true as const, batchId: "b2", rows: [row("d", "ready"), row("e", "ready")], continueCursor: "", isDone: true },
];

describe("importAllPages", () => {
  it("imports the ready rows of every page and tallies the outcome", async () => {
    const loadPage = vi.fn(async (cursor?: string) => pages[cursor === "p2" ? 1 : 0]);
    const submit = vi.fn(async (batchId: string, ids: string[]) => ({ ok: true as const, rows: pages.find(page => page.batchId === batchId)!.rows.map(r => ids.includes(r.id) ? { ...r, status: r.id === "e" ? "failed" : "imported", reason: r.id === "e" ? "Retry" : null } : r) }));
    const result = await importAllPages({ loadPage, submit, onProgress: vi.fn(), shouldStop: () => false });
    expect(loadPage.mock.calls).toEqual([[undefined], ["p2"]]);
    expect(submit.mock.calls).toEqual([["b1", ["a"]], ["b2", ["d", "e"]]]);
    expect(result).toMatchObject({ done: true, pages: 2, imported: 2, existing: 1 });
    expect(result.attention.map(r => r.id)).toEqual(["c", "e"]);
  });

  it("stops after the current page and surfaces action errors", async () => {
    const submit = vi.fn(async (_: string, ids: string[]) => ({ ok: true as const, rows: ids.map(id => row(id, "imported")) }));
    const stopped = await importAllPages({ loadPage: async () => pages[0], submit, onProgress: vi.fn(), shouldStop: () => true });
    expect(stopped).toMatchObject({ done: false, pages: 1, imported: 1 });
    expect(stopped.error).toBeUndefined();
    const failed = await importAllPages({ loadPage: async () => ({ ok: false, error: "Reconnect" }), submit, onProgress: vi.fn(), shouldStop: () => false });
    expect(failed).toMatchObject({ done: false, pages: 0, error: "Reconnect" });
  });

  it("does not loop when the provider repeats a cursor", async () => {
    const result = await importAllPages({ loadPage: async () => ({ ...pages[0], rows: [] }), submit: vi.fn(), onProgress: vi.fn(), shouldStop: () => false });
    expect(result.done).toBe(false);
    expect(result.error).toMatch(/stopped returning/);
  });
});
