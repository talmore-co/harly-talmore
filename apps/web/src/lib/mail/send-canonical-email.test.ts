import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  send: vi.fn(),
  getWorkspaceEmailSender: vi.fn(),
  insertCanonicalMessage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [
            {
              id: "reservation-1",
              status: "pending",
              messageId: "<mail-1@harly.local>",
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => {
        mocks.updates.push(set);
        return {
          where: () => {
            const result = Promise.resolve([]) as Promise<unknown[]> & {
              returning?: () => Promise<unknown[]>;
            };
            result.returning = async () => [{ id: "reservation-1" }];
            return result;
          },
        };
      },
    }),
  },
  applications: {},
  candidates: {},
  jobs: {},
  mailIdempotencyKeys: {},
  mailUnificationMigrations: {},
}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  isNull: (...values: unknown[]) => values,
}));
vi.mock("@/lib/email", () => ({
  getWorkspaceEmailSender: mocks.getWorkspaceEmailSender,
}));
vi.mock("./canonical", () => ({
  insertCanonicalMessage: mocks.insertCanonicalMessage,
}));
vi.mock("./feature-flag", () => ({
  isMailUnificationEnabled: vi.fn(async () => true),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { sendCanonicalEmail } from "./send-canonical-email";

const input = {
  workspaceId: "ws-1",
  idempotencyKey: "attempt-1",
  toEmail: "candidate@example.com",
  subject: "Hello",
  textBody: "Hi there",
};

function finalStatus() {
  return mocks.updates.at(-1);
}

describe("sendCanonicalEmail delivery bookkeeping", () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.send.mockReset();
    mocks.getWorkspaceEmailSender.mockReset();
    mocks.getWorkspaceEmailSender.mockResolvedValue({ send: mocks.send });
    mocks.insertCanonicalMessage.mockReset();
    mocks.insertCanonicalMessage.mockResolvedValue({
      threadId: "thread-1",
      messageId: "mail-message-1",
    });
  });

  it("marks the reservation sent after a successful delivery", async () => {
    mocks.send.mockResolvedValue({ messageId: "provider-1" });

    await expect(sendCanonicalEmail(input)).resolves.toMatchObject({
      delivered: true,
      providerMessageId: "provider-1",
    });
    expect(finalStatus()).toMatchObject({ status: "sent" });
  });

  it("keeps the reservation retryable when the provider rejected the message", async () => {
    mocks.send.mockRejectedValue(new Error("provider rejected"));

    await expect(sendCanonicalEmail(input)).rejects.toThrow("provider rejected");
    expect(finalStatus()).toMatchObject({ status: "failed" });
    expect(finalStatus()).not.toHaveProperty("providerMessageId");
  });

  it("does not make an accepted message retryable when bookkeeping fails afterwards", async () => {
    mocks.send.mockResolvedValue({ messageId: "provider-1" });
    mocks.insertCanonicalMessage.mockRejectedValue(new Error("db unavailable"));

    await expect(sendCanonicalEmail(input)).rejects.toThrow("db unavailable");
    // "failed" would let a retry claim the key and send the email again.
    expect(finalStatus()).toMatchObject({
      status: "unknown",
      providerMessageId: "provider-1",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
