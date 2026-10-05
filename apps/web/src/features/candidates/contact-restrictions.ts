import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { candidates, db } from "@harly/db";

export function contactRestriction(row: { emailOptedOut: boolean; contactOffLimits: boolean; contactOffLimitsUntil: Date | null }, now = new Date()) {
  if (row.emailOptedOut) return "This candidate has opted out of email. Sending is disabled.";
  if (row.contactOffLimits && (!row.contactOffLimitsUntil || row.contactOffLimitsUntil > now)) return "This candidate is marked off limits. Outbound contact is disabled.";
  return null;
}
export async function assertCandidateContactAllowed(workspaceId: string, target: { candidateId?: string; email?: string }) {
  if (!target.candidateId && !target.email) return;
  const rows = await db.select({ emailOptedOut: candidates.emailOptedOut, contactOffLimits: candidates.contactOffLimits, contactOffLimitsUntil: candidates.contactOffLimitsUntil }).from(candidates).where(and(eq(candidates.workspaceId, workspaceId), or(target.candidateId ? eq(candidates.id, target.candidateId) : undefined, target.email ? sql`lower(${candidates.email}) = ${target.email.trim().toLowerCase()}` : undefined)));
  for (const row of rows) { const reason = contactRestriction(row); if (reason) throw new Error(reason); }
}
