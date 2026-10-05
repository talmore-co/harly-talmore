import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { candidates, db } from "@harly/db";

/**
 * "email" is recruiter- or automation-initiated email: blocked by an opt-out or an active off-limits flag.
 * "contact" is any other outreach such as scheduling: an email opt-out alone does not block it.
 */
export type ContactPurpose = "email" | "contact";
type RestrictionRow = { emailOptedOut: boolean; contactOffLimits: boolean; contactOffLimitsUntil: Date | null };

export class ContactRestrictedError extends Error {}

export function contactRestriction(row: RestrictionRow, now = new Date(), purpose: ContactPurpose = "email") {
  if (purpose === "email" && row.emailOptedOut) return "This candidate has opted out of email. Sending is disabled.";
  if (row.contactOffLimits && (!row.contactOffLimitsUntil || row.contactOffLimitsUntil > now)) return "This candidate is marked off limits. Outbound contact is disabled.";
  return null;
}
export async function assertCandidateContactAllowed(workspaceId: string, target: { candidateId?: string; email?: string }, purpose: ContactPurpose = "email") {
  if (!target.candidateId && !target.email) return;
  const rows = await db.select({ emailOptedOut: candidates.emailOptedOut, contactOffLimits: candidates.contactOffLimits, contactOffLimitsUntil: candidates.contactOffLimitsUntil }).from(candidates).where(and(eq(candidates.workspaceId, workspaceId), or(target.candidateId ? eq(candidates.id, target.candidateId) : undefined, target.email ? sql`lower(${candidates.email}) = ${target.email.trim().toLowerCase()}` : undefined)));
  for (const row of rows) { const reason = contactRestriction(row, new Date(), purpose); if (reason) throw new ContactRestrictedError(reason); }
}
