import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./personal-client", () => ({ personalCalFetch: fetchMock }));
import { findPooledCalBooking } from "./pooled-client";

const metadata = {
  talmoreInvitationId: "invitation-1",
  talmoreBookingRequestId: "request-1",
};
const page = (
  data: { uid: string; metadata?: Record<string, unknown> }[],
  pagination: { hasMore: boolean; nextCursor?: string | null } = {
    hasMore: false,
    nextCursor: null,
  },
) => ({ data, pagination });
const find = () =>
  findPooledCalBooking(
    "fictional-key",
    101,
    new Date("2030-01-01T10:00:00.000Z"),
    30,
    "invitation-1",
    "request-1",
  );

beforeEach(() => fetchMock.mockReset());
describe("findPooledCalBooking", () => {
  it("returns the single booking carrying this request's metadata", async () => {
    fetchMock.mockResolvedValue(
      page([{ uid: "other" }, { uid: "booking-1", metadata }]),
    );
    expect(await find()).toEqual({ uid: "booking-1", conclusive: true });
  });
  it("is conclusive only when every page was read without a match", async () => {
    fetchMock
      .mockResolvedValueOnce(
        page([{ uid: "other" }], { hasMore: true, nextCursor: "next" }),
      )
      .mockResolvedValueOnce(page([]));
    expect(await find()).toEqual({ uid: null, conclusive: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1]).toContain("cursor=next");
  });
  it("is inconclusive for duplicate matches or pages it could not finish", async () => {
    fetchMock.mockResolvedValueOnce(
      page([
        { uid: "booking-1", metadata },
        { uid: "booking-2", metadata },
      ]),
    );
    expect(await find()).toEqual({ uid: null, conclusive: false });
    fetchMock.mockResolvedValueOnce(page([], { hasMore: true }));
    expect(await find()).toEqual({ uid: null, conclusive: false });
    fetchMock.mockResolvedValue(page([], { hasMore: true, nextCursor: "next" }));
    expect(await find()).toEqual({ uid: null, conclusive: false });
  });
});
