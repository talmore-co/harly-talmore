import "server-only";
import { and, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { candidateDuplicateDismissals, candidates, db } from "@harly/db";

export async function duplicateSuspects(
  workspaceId: string,
  candidateId: string,
  otherCandidateId?: string,
) {
  const [target] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        eq(candidates.id, candidateId),
        isNull(candidates.deletedAt),
        isNull(candidates.anonymizedAt),
      ),
    );
  if (!target) return [];
  const phone = (target.phone ?? "").replace(/\D/g, "");
  const linkedin = (target.linkedinUrl ?? "")
    .trim()
    .toLowerCase()
    .replace(/\/$/, "");
  const first = target.firstName.trim().toLowerCase(),
    last = target.lastName.trim().toLowerCase();
  const rows = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        ne(candidates.id, candidateId),
        isNull(candidates.deletedAt),
        isNull(candidates.anonymizedAt),
        otherCandidateId ? eq(candidates.id, otherCandidateId) : undefined,
        or(
          first && last
            ? sql`lower(trim(${candidates.firstName})) = ${first} and lower(trim(${candidates.lastName})) = ${last}`
            : undefined,
          sql`lower(trim(${candidates.email})) = ${target.email.trim().toLowerCase()}`,
          phone.length >= 7
            ? sql`regexp_replace(coalesce(${candidates.phone}, ''), '[^0-9]', '', 'g') = ${phone}`
            : undefined,
          linkedin
            ? sql`lower(rtrim(trim(coalesce(${candidates.linkedinUrl}, '')), '/')) = ${linkedin}`
            : undefined,
        ),
        notExists(
          db
            .select({ id: candidateDuplicateDismissals.id })
            .from(candidateDuplicateDismissals)
            .where(
              and(
                eq(candidateDuplicateDismissals.workspaceId, workspaceId),
                or(
                  and(
                    eq(candidateDuplicateDismissals.candidateId, candidateId),
                    eq(
                      candidateDuplicateDismissals.otherCandidateId,
                      candidates.id,
                    ),
                  ),
                  and(
                    eq(
                      candidateDuplicateDismissals.otherCandidateId,
                      candidateId,
                    ),
                    eq(candidateDuplicateDismissals.candidateId, candidates.id),
                  ),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(candidates.lastName, candidates.firstName, candidates.id)
    .limit(20);
  return rows.map((row) => ({
    candidateId: row.id,
    fullName: `${row.firstName} ${row.lastName}`,
    email: row.email,
    reasons: [
      row.firstName.trim().toLowerCase() === first &&
      row.lastName.trim().toLowerCase() === last
        ? "Same full name"
        : null,
      row.email.trim().toLowerCase() === target.email.trim().toLowerCase()
        ? "Same email"
        : null,
      phone.length >= 7 && (row.phone ?? "").replace(/\D/g, "") === phone
        ? "Same phone number"
        : null,
      linkedin &&
      (row.linkedinUrl ?? "").trim().toLowerCase().replace(/\/$/, "") ===
        linkedin
        ? "Same LinkedIn URL"
        : null,
    ].filter((value): value is string => Boolean(value)),
  }));
}
