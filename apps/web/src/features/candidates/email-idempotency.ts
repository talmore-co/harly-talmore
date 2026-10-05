import { randomUUID } from "node:crypto";

/**
 * Idempotency keys for recruiter-composed candidate email.
 *
 * A key identifies one send attempt (a compose session or a bulk batch), never
 * the message content: the same follow-up sent twice on purpose must go out
 * twice, while a retried submit of the same attempt must not.
 */

/** Key for one message composed in the candidate email drawer. */
export function candidateMessageIdempotencyKey(input: {
  candidateId: string;
  /** Generated once per compose session by the client. */
  clientKey?: string | null;
}): string {
  const attempt = input.clientKey?.trim() || randomUUID();
  return `candidate-message:${input.candidateId}:${attempt}`;
}

/** Key for one recipient of a bulk send. */
export function bulkCandidateEmailIdempotencyKey(input: {
  /** One id per bulk send, shared by every recipient in that send. */
  batchId: string;
  candidateId: string;
}): string {
  return `bulk-candidate:${input.batchId}:${input.candidateId}`;
}
