import { afterEach, describe, expect, it, vi } from "vitest";
import { connectionSchema, missingImportScopes, sourceRequest, sourceResources } from "./client";

afterEach(() => vi.unstubAllGlobals());
describe("TalentSourcer API contracts", () => {
  it("accepts the documented minimal read scopes and their aliases", () => {
    expect(missingImportScopes(["projects:read", "candidates:read", "campaigns:read"])).toEqual([]);
    expect(missingImportScopes(["projects:read", "candidates:read", "shortlists:read"])).toEqual([]);
    expect(missingImportScopes(["projects:read", "shortlists:read", "ats:read"])).toEqual([]);
    expect(missingImportScopes(["projects:write", "candidates:write"])).not.toEqual([]);
  });
  it("paginates named resource envelopes and encodes opaque cursors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ projects: [{ id: "one", title: "First role" }], continueCursor: "opaque +&cursor", isDone: false })).mockResolvedValueOnce(Response.json({ projects: [{ id: "two", title: "Second role" }], continueCursor: "", isDone: true }));
    vi.stubGlobal("fetch", fetcher);
    expect((await sourceResources("fictional-token", "projects")).map(row => row.id)).toEqual(["one", "two"]);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("cursor")).toBe("opaque +&cursor");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("rejects repeated cursors instead of repeatedly importing one page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ shortlists: [], continueCursor: "same", isDone: false })));
    await expect(sourceResources("fictional-token", "shortlists?projectId=one")).rejects.toThrow("Too many");
  });
  it("does not expose provider error bodies or credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream error", { status: 403 })));
    await expect(sourceRequest("fictional-token", "connection", connectionSchema)).rejects.toThrow("Check its permissions");
  });
});
