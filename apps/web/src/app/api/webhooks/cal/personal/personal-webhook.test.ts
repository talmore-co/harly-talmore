import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ subscription: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/cal/personal-bookings", () => ({
  getPersonalCalSubscription: mocks.subscription,
  syncPersonalCalBooking: mocks.sync,
}));
import { POST } from "./[subscriptionId]/route";
const subscriptionId = "22222222-2222-4222-8222-222222222222";
const secret = "fictional-secret";
function request(
  body: string,
  signature = createHmac("sha256", secret).update(body).digest("hex"),
) {
  return new NextRequest(
    "https://ats.example.test/api/webhooks/cal/personal/test",
    { method: "POST", body, headers: { "x-cal-signature-256": signature } },
  );
}
const context = { params: Promise.resolve({ subscriptionId }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscription.mockResolvedValue({
    subscription: { webhookSecret: secret },
  });
  mocks.sync.mockResolvedValue({ matched: true });
});
describe("personal Cal.com webhook boundary", () => {
  it("requires the signature before processing a booking", async () => {
    const response = await POST(
      request(
        JSON.stringify({
          triggerEvent: "BOOKING_CREATED",
          payload: { uid: "booking" },
        }),
        "invalid",
      ),
      context,
    );
    expect(response.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("accepts signed events and resolves the booking from the provider", async () => {
    const response = await POST(
      request(
        JSON.stringify({
          triggerEvent: "BOOKING_RESCHEDULED",
          payload: { uid: "booking", metadata: { applicationId: "untrusted" } },
        }),
      ),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(subscriptionId, "booking");
  });
  it("rejects inactive connections", async () => {
    mocks.subscription.mockResolvedValue(null);
    expect((await POST(request("{}"), context)).status).toBe(404);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("bounds the body and rejects malformed signed data", async () => {
    expect(
      (await POST(request("x".repeat(256 * 1024 + 1)), context)).status,
    ).toBe(413);
    for (const body of [
      "null",
      "{",
      '{"triggerEvent":"BOOKING_CREATED","payload":{}}',
    ]) {
      expect((await POST(request(body), context)).status).toBe(400);
    }
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("returns a retryable failure when provider lookup fails", async () => {
    mocks.sync.mockRejectedValue(new Error("private provider details"));
    const response = await POST(
      request('{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"booking"}}'),
      context,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider details");
  });
});
