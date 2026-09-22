import "server-only";
import { db, talentSourcerImportBatches as batches, talentSourcerImportItems as items } from "@harly/db";
import { and, inArray, lt, or, sql } from "drizzle-orm";

/** Preview snapshots are short-lived; permanent provenance lives in activities. */
export async function expireTalentSourcerPreviews() {
  const expired = await db.select({ id: batches.id }).from(batches).where(and(lt(batches.expiresAt, new Date()), or(lt(batches.createdAt, new Date(Date.now() - 7 * 86400000)), sql`exists (select 1 from ${items} where ${items.batchId} = ${batches.id} and ${items.profile} <> '{}'::jsonb)`))).limit(100);
  if (!expired.length) return 0;
  const ids = expired.map(row => row.id);
  await db.update(items).set({ profile: {}, reason: null }).where(and(inArray(items.batchId, ids), sql`${items.profile} <> '{}'::jsonb`));
  // Keep batch receipts for seven days so recent results can be audited. Snapshot
  // data is already erased; imported candidates and activities remain independent.
  await db.delete(batches).where(and(inArray(batches.id, ids), lt(batches.createdAt, new Date(Date.now() - 7 * 86400000))));
  return expired.length;
}
