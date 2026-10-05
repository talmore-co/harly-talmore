/**
 * Outbox dedupe key for a candidate-facing interview email.
 *
 * Without an explicit key the outbox dedupes on a hash of the payload, which
 * also matches rows that were sent long ago: rescheduling A → B → A → B drops
 * the second "rescheduled to B", and re-booking a canceled slot drops the
 * confirmation. The key therefore identifies the action, not the content.
 *
 * `actionId` is the id of the domain event persisted in the same transaction
 * as the interview change. It is unique per schedule/reschedule/cancel and
 * stable when the same action is enqueued twice.
 *
 * Returns undefined when there is no action id, which keeps the payload-hash
 * behaviour for that call.
 */
export function interviewEmailDedupeKey(input: {
  kind: string;
  interviewId: string;
  actionId?: string | null;
}): string | undefined {
  if (!input.actionId) return undefined;
  return `interview-email:${input.kind}:${input.interviewId}:${input.actionId}`;
}
