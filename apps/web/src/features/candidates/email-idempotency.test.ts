import { describe, expect, it } from "vitest";

import {
  bulkCandidateEmailIdempotencyKey,
  candidateMessageIdempotencyKey,
} from "./email-idempotency";

describe("candidate email idempotency keys", () => {
  it("keeps one compose session on one key so a retried submit is a replay", () => {
    const first = candidateMessageIdempotencyKey({
      candidateId: "cand-1",
      clientKey: "session-1",
    });
    const retry = candidateMessageIdempotencyKey({
      candidateId: "cand-1",
      clientKey: "session-1",
    });

    expect(retry).toBe(first);
  });

  it("gives a second identical follow-up its own key", () => {
    // Subject and body are not inputs at all: two compose sessions with the
    // same text are two emails.
    const first = candidateMessageIdempotencyKey({
      candidateId: "cand-1",
      clientKey: "session-1",
    });
    const second = candidateMessageIdempotencyKey({
      candidateId: "cand-1",
      clientKey: "session-2",
    });

    expect(second).not.toBe(first);
  });

  it("never reuses a key when the caller supplies no session key", () => {
    const first = candidateMessageIdempotencyKey({ candidateId: "cand-1" });
    const second = candidateMessageIdempotencyKey({ candidateId: "cand-1" });

    expect(second).not.toBe(first);
    expect(first.startsWith("candidate-message:cand-1:")).toBe(true);
  });

  it("scopes a session key to its candidate", () => {
    expect(
      candidateMessageIdempotencyKey({ candidateId: "cand-1", clientKey: "s" }),
    ).not.toBe(
      candidateMessageIdempotencyKey({ candidateId: "cand-2", clientKey: "s" }),
    );
  });

  it("keys a bulk send by batch and candidate", () => {
    const first = bulkCandidateEmailIdempotencyKey({
      batchId: "batch-1",
      candidateId: "cand-1",
    });

    // Same batch, same candidate: a replay.
    expect(
      bulkCandidateEmailIdempotencyKey({ batchId: "batch-1", candidateId: "cand-1" }),
    ).toBe(first);
    // Same batch, another candidate: its own email.
    expect(
      bulkCandidateEmailIdempotencyKey({ batchId: "batch-1", candidateId: "cand-2" }),
    ).not.toBe(first);
    // A later bulk send with the same text to the same candidate: a new email.
    expect(
      bulkCandidateEmailIdempotencyKey({ batchId: "batch-2", candidateId: "cand-1" }),
    ).not.toBe(first);
  });

  it("stays within the stored key length", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(
      candidateMessageIdempotencyKey({ candidateId: uuid, clientKey: uuid }).length,
    ).toBeLessThanOrEqual(200);
    expect(
      bulkCandidateEmailIdempotencyKey({ batchId: uuid, candidateId: uuid }).length,
    ).toBeLessThanOrEqual(200);
  });
});
