/**
 * Internal rejection reasons. Shared by the rejection dialog, the server
 * actions that store them and the reports breakdown. The reason and note are
 * recruiter-only: never send them to candidates (portal, emails, webhooks).
 */
export const REJECTION_REASONS = [
  { code: "not_qualified", label: "Not qualified" },
  { code: "missing_experience", label: "Missing experience" },
  { code: "salary_expectations", label: "Salary expectations" },
  { code: "location", label: "Location or relocation" },
  { code: "position_filled", label: "Position filled" },
  { code: "failed_assessment", label: "Interview or assessment" },
  { code: "team_fit", label: "Team fit" },
  { code: "unresponsive", label: "Candidate unresponsive" },
  { code: "duplicate", label: "Duplicate application" },
  { code: "other", label: "Other" },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]["code"];

export const REJECTION_NOTE_MAX_LENGTH = 500;
export const UNSPECIFIED_REJECTION_REASON_LABEL = "Unspecified";

const labels = new Map<string, string>(
  REJECTION_REASONS.map((reason) => [reason.code, reason.label]),
);

export function isRejectionReasonCode(
  value: unknown,
): value is RejectionReasonCode {
  return typeof value === "string" && labels.has(value);
}

/** Unknown or retired codes fall back to "Unspecified" instead of leaking a raw code. */
export function rejectionReasonLabel(code: string | null | undefined) {
  return (code && labels.get(code)) || UNSPECIFIED_REJECTION_REASON_LABEL;
}

export type RejectionDetails = {
  reason: RejectionReasonCode | null;
  note: string | null;
};

/**
 * Validates optional rejection details from a client or API caller. Both
 * fields stay optional so existing flows and automations are never blocked.
 */
export function parseRejectionDetails(input: {
  rejectionReason?: unknown;
  rejectionNote?: unknown;
}): { ok: true; details: RejectionDetails } | { ok: false; error: string } {
  const { rejectionReason, rejectionNote } = input;
  if (
    rejectionReason !== undefined &&
    rejectionReason !== null &&
    !isRejectionReasonCode(rejectionReason)
  ) {
    return { ok: false, error: "Invalid rejection reason." };
  }
  if (
    rejectionNote !== undefined &&
    rejectionNote !== null &&
    typeof rejectionNote !== "string"
  ) {
    return { ok: false, error: "Invalid rejection note." };
  }
  const note = rejectionNote?.trim() ?? "";
  if (note.length > REJECTION_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Rejection notes can be up to ${REJECTION_NOTE_MAX_LENGTH} characters.`,
    };
  }
  return {
    ok: true,
    details: { reason: rejectionReason ?? null, note: note || null },
  };
}

/**
 * Column values to write alongside an application status change. Leaving
 * rejected always clears both fields; a rejection without details keeps what
 * an earlier rejection stored instead of wiping it.
 */
export function rejectionDetailsPatch(
  previousStatus: string,
  nextStatus: string,
  details?: RejectionDetails | null,
): { rejectionReason?: string | null; rejectionNote?: string | null } {
  if (nextStatus !== "rejected") {
    return { rejectionReason: null, rejectionNote: null };
  }
  if (details?.reason || details?.note) {
    return { rejectionReason: details.reason, rejectionNote: details.note };
  }
  return previousStatus === "rejected"
    ? {}
    : { rejectionReason: null, rejectionNote: null };
}

export type RejectionReasonCount = {
  /** `null` is the "Unspecified" bucket. */
  code: RejectionReasonCode | null;
  label: string;
  count: number;
};

/**
 * Counts rejections per reason in list order, with rejections that have no
 * (or an unknown) reason collected in a trailing "Unspecified" bucket.
 */
export function countRejectionReasons(
  reasons: (string | null | undefined)[],
): RejectionReasonCount[] {
  const counts = new Map<string, number>();
  let unspecified = 0;
  for (const reason of reasons) {
    if (isRejectionReasonCode(reason))
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    else unspecified++;
  }
  return [
    ...REJECTION_REASONS.map(({ code, label }) => ({
      code: code as RejectionReasonCode | null,
      label,
      count: counts.get(code) ?? 0,
    })),
    { code: null, label: UNSPECIFIED_REJECTION_REASON_LABEL, count: unspecified },
  ];
}
