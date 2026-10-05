import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getWorkspaceInboundEmailConfig: vi.fn(),
  processInboundEmail: vi.fn(),
  verifySignature: vi.fn(),
}));

// Keep the real Resend parser; only the signature check is replaced.
vi.mock("@harly/emails", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harly/emails")>();
  return {
    ...actual,
    resendAdapter: {
      ...actual.resendAdapter,
      verifySignature: mocks.verifySignature,
    },
  };
});
vi.mock("@/lib/email/config", () => ({
  getWorkspaceInboundEmailConfig: mocks.getWorkspaceInboundEmailConfig,
}));
vi.mock("@/lib/email/inbound-processor", () => ({
  processInboundEmail: mocks.processInboundEmail,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://harly.test/api/webhooks/email/resend?ws=ws-1", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ provider: "resend" }) },
  );
}

describe("POST /api/webhooks/email/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySignature.mockReturnValue(true);
    mocks.getWorkspaceInboundEmailConfig.mockResolvedValue({
      provider: "resend",
      webhookSecret: "fictional-secret",
      resendApiKey: undefined,
    });
  });

  it("acknowledges a verified event that is not an inbound email", async () => {
    const response = await post({
      type: "email.delivered",
      data: { email_id: "email-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.processInboundEmail).not.toHaveBeenCalled();
  });

  it("still rejects an inbound email it cannot process", async () => {
    // No API key is configured, so the body cannot be fetched.
    const response = await post({
      type: "email.received",
      data: { email_id: "email-1" },
    });

    expect(response.status).toBe(400);
    expect(mocks.processInboundEmail).not.toHaveBeenCalled();
  });

  it("rejects an unsigned request before looking at the event type", async () => {
    mocks.verifySignature.mockReturnValue(false);

    const response = await post({ type: "email.delivered", data: {} });

    expect(response.status).toBe(401);
  });
});
