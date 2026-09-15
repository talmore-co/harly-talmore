import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ssrf", () => ({ safeFetchHttp: fetchMock }));
import {
  ensurePersonalCalWebhook,
  listPersonalCalEvents,
  personalCalFetch,
  removePersonalCalWebhook,
} from "./personal-client";
const reply = (data: unknown) =>
  new Response(JSON.stringify({ status: "success", data }));
beforeEach(() => fetchMock.mockReset());
describe("personal Cal.com client", () => {
  it("only lists the connected user's events", async () => {
    fetchMock.mockResolvedValue(
      reply([
        {
          id: 1,
          title: "Mine",
          slug: "screen",
          lengthInMinutes: 30,
          ownerId: 7,
        },
      {
        id: 2,
          title: "Other",
          slug: "other",
          lengthInMinutes: 30,
        ownerId: 8,
      },
      { id: 3, title: "Shared", slug: "shared", lengthInMinutes: 30, ownerId: 8, users: [{ id: 7 }] },
      { id: 4, title: "Collective", slug: "collective", lengthInMinutes: 30, ownerId: 7, users: [{ id: 7 }, { id: 8 }] },
      ]),
    );
    expect(
      await listPersonalCalEvents("fictional-key", {
        id: 7,
        username: "fictional",
      }),
    ).toEqual([
      expect.objectContaining({
        id: 1,
        bookingUrl: "https://cal.com/fictional/screen",
      }),
    ]);
  });
  it("recovers an existing webhook after an uncertain create and removes only its duplicates", async () => {
    const callback = "https://ats.example.test/api/webhooks/cal/personal/test";
    fetchMock
      .mockResolvedValueOnce(
        reply([
          { id: "one", subscriberUrl: callback },
          { id: "two", subscriberUrl: callback },
          { id: "other", subscriberUrl: "https://other.example.test/hook" },
        ]),
      )
      .mockResolvedValueOnce(reply({ id: "one", subscriberUrl: callback }))
      .mockResolvedValueOnce(reply({}));
    expect(
      await ensurePersonalCalWebhook("fictional-key", 12, callback, "secret"),
    ).toBe("one");
    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init.method]),
    ).toEqual([
      ["https://api.cal.com/v2/event-types/12/webhooks", "GET"],
      ["https://api.cal.com/v2/event-types/12/webhooks/one", "PATCH"],
      ["https://api.cal.com/v2/event-types/12/webhooks/two", "DELETE"],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).version).toBe(
      "2021-10-20",
    );
  });
  it("disconnect leaves unrelated webhooks intact", async () => {
    fetchMock.mockResolvedValue(
      reply([
        { id: "other", subscriberUrl: "https://other.example.test/hook" },
      ]),
    );
    await removePersonalCalWebhook(
      "fictional-key",
      12,
      "https://ats.example.test/hook",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not expose remote error bodies or credentials", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "fictional-key" } }), {
        status: 401,
      }),
    );
    await expect(personalCalFetch("fictional-key", "/me")).rejects.toThrow(
      "Cal.com request failed (401)",
    );
  });
});
