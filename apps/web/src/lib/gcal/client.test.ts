import { afterEach, describe, expect, it, vi } from "vitest";
import type { OAuth2Client } from "google-auth-library";
import { getFreeBusy, listCalendars } from "./client";

const client = { getAccessToken: async () => ({ token: "synthetic-token" }) } as OAuth2Client;
afterEach(() => vi.unstubAllGlobals());

describe("Google Calendar response handling", () => {
  it("follows calendar pagination and includes read-only calendars when requested", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [{ id: "work" }], nextPageToken: "next-page" }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: "shared" }] }));
    vi.stubGlobal("fetch", fetch);
    expect((await listCalendars(client, false)).map((c) => c.id)).toEqual(["work", "shared"]);
    expect(fetch.mock.calls[1][0]).toContain("minAccessRole=freeBusyReader&pageToken=next-page");
  });

  it("does not interpret a per-calendar API error as available time", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ calendars: { work: { errors: [{ reason: "notFound" }] } } })));
    await expect(getFreeBusy(client, "work", new Date(), new Date())).rejects.toThrow("could not check");
  });
});
