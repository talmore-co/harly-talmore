import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { candidates, clientOffers, db, jobs, offers } from "@harly/db";

/** Actual decisions, not stage movements or hires without an offer. */
export async function getOfferDecisions(workspaceId: string) {
  const read = (table: typeof offers | typeof clientOffers) => db.select({ status: table.status, at: table.decidedAt }).from(table)
    .innerJoin(jobs, and(eq(jobs.id, table.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)))
    .innerJoin(candidates, and(eq(candidates.id, table.candidateId), eq(candidates.workspaceId, workspaceId), isNull(candidates.deletedAt)))
    .where(and(eq(table.workspaceId, workspaceId), inArray(table.status, ["accepted", "declined"])));
  const rows = (await Promise.all([read(offers), read(clientOffers)])).flat();
  return rows;
}
export async function getOfferDecisionTotals(workspaceId: string) {
  const rows = await getOfferDecisions(workspaceId);
  return [{ accepted: rows.filter((row) => row.status === "accepted").length, decided: rows.length }];
}
