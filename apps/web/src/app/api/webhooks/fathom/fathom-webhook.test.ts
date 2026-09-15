import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ importWebhook: vi.fn() }));
vi.mock("@/lib/fathom/import", () => ({
  importFathomWebhook: mocks.importWebhook,
}));
import { POST } from "./[connectionId]/route";

const context = {
  params: Promise.resolve({
    connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }),
};
describe("Fathom receiver boundaries", () => {
  beforeEach(() => {
    mocks.importWebhook.mockReset();
  });
  it("rejects oversized streaming bodies even without content-length", async () => {
    const request = new NextRequest(
      "http://localhost/api/webhooks/fathom/test",
      { method: "POST", body: "x".repeat(4 * 1024 * 1024 + 1) },
    );
    expect((await POST(request, context)).status).toBe(413);
    expect(mocks.importWebhook).not.toHaveBeenCalled();
  });
  it("acknowledges unrelated meetings without exposing match state", async () => {
    mocks.importWebhook.mockResolvedValue("ignored");
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/fathom/test", {
        method: "POST",
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
  it("returns 401 for invalid signatures", async () => {
    mocks.importWebhook.mockResolvedValue("unauthorized");
    expect(
      (
        await POST(
          new NextRequest("http://localhost/api/webhooks/fathom/test", {
            method: "POST",
            body: "{}",
          }),
          context,
        )
      ).status,
    ).toBe(401);
  });
  it("returns a retryable error without leaking database details", async () => {
    mocks.importWebhook.mockRejectedValue(
      new Error("private database details"),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/fathom/test", {
        method: "POST",
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
