import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/ssrf", () => ({ safeFetchHttp: mocks.fetch }));
import {
  createFathomWebhook,
  deleteFathomWebhook,
  FathomApiError,
} from "./client";

describe("Fathom API client", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
  });
  it("registers only own recordings with summaries and transcripts", async () => {
    const callback = "https://ats.example.test/api/webhooks/fathom/fictional";
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "hook",
          secret: `whsec_${Buffer.alloc(32, 9).toString("base64")}`,
          url: callback,
          include_summary: true,
          include_transcript: true,
          triggered_for: ["my_recordings", "my_shared_with_team_recordings"],
        }),
        { status: 201 },
      ),
    );
    await createFathomWebhook("fictional-key", callback);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://api.fathom.ai/external/v1/webhooks");
    expect(options.headers["X-Api-Key"]).toBe("fictional-key");
    expect(JSON.parse(options.body)).toEqual({
      destination_url: callback,
      triggered_for: ["my_recordings", "my_shared_with_team_recordings"],
      include_summary: true,
      include_transcript: true,
      include_action_items: false,
      include_crm_matches: false,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("does not expose provider response bodies in errors", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("private provider details", { status: 401 }),
    );
    await expect(
      createFathomWebhook("fictional-key", "https://example.test/hook"),
    ).rejects.toEqual(new FathomApiError(401));
  });
  it("treats an already-removed webhook as successful cleanup", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      deleteFathomWebhook("fictional-key", "our-hook"),
    ).resolves.toBeUndefined();
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://api.fathom.ai/external/v1/webhooks/our-hook",
    );
  });
});
