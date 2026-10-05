import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, lte, or } from "drizzle-orm";
import { db, recruitCrmConnections, recruitCrmImportBatches as batches, recruitCrmImportItems as items } from "@harly/db";
import { z } from "zod";
import { importAccess } from "./access";
import { sourcePage } from "./browse";
import { connected, CrmError, CrmRetry, request } from "./client";
import { userSchema } from "./contracts";
import { candidateValues } from "./profile";

/** One source page per turn, leaving request budget for candidate imports. */
export async function discoverRecruitCrmPage() {
  const batch = await db.transaction(async tx => {
    const [row] = await tx.select().from(batches).where(and(eq(batches.importAll, true), lte(batches.discoveryRetryAt, new Date()), or(eq(batches.discoveryStatus, "queued"), and(eq(batches.discoveryStatus, "processing"), lt(batches.discoveryLockedAt, new Date(Date.now() - 5 * 60_000)))))).orderBy(batches.discoveryRetryAt).limit(1).for("update", { skipLocked: true });
    if (!row) return null;
    const [claimed] = await tx.update(batches).set({ discoveryStatus: "processing", discoveryLeaseId: randomUUID(), discoveryLockedAt: new Date() }).where(eq(batches.id, row.id)).returning();
    return claimed;
  });
  if (!batch?.discoveryLeaseId) return;
  const guard = and(eq(batches.id, batch.id), eq(batches.discoveryLeaseId, batch.discoveryLeaseId));
  try {
    if (batch.expiresAt.getTime() < Date.now()) throw new CrmError("Import expired. Create a fresh preview.");
    if (batch.source.version !== 1) throw new CrmError("This preview has no saved filters. Create a fresh preview.");
    await importAccess(batch.workspaceId, batch.actorId, batch.jobId, batch.stageId);
    const connection = await connected(batch.workspaceId, batch.connectionId);
    if (connection.revision !== batch.connectionRevision) throw new CrmError("Connection changed. Create a fresh preview.");
    if (batch.nextPage === 1) {
      const users = await request(batch.workspaceId, batch.connectionId, batch.connectionRevision, "users", z.array(userSchema));
      if (!users.some(user => user.id === connection.accountAnchor)) throw new CrmError("The Recruit CRM account identity changed. Check the connection.");
    }
    const page = await sourcePage(batch.workspaceId, batch.connectionId, batch.connectionRevision, batch.source, batch.nextPage, 100);
    if (page.data.length > 100) throw new CrmError("Recruit CRM exceeded the requested page size.");
    const rows = [...new Map(page.data.map(row => [row.slug, row])).values()].map(row => {
      let reason: string | null = null;
      try { candidateValues(row); } catch { reason = "Profile is missing a name or has an invalid email."; }
      return { workspaceId: batch.workspaceId, batchId: batch.id, externalSlug: row.slug, snapshot: row as Record<string, unknown>, status: reason ? "skipped" : "queued", reason };
    });
    await db.transaction(async tx => {
      const [current] = await tx.select().from(batches).where(guard).for("update");
      if (!current) return;
      // A disconnect cannot race this page commit; candidate writes check again later.
      const [active] = await tx.select().from(recruitCrmConnections).where(and(eq(recruitCrmConnections.id, batch.connectionId), eq(recruitCrmConnections.workspaceId, batch.workspaceId))).for("share");
      if (!active?.token || active.revision !== batch.connectionRevision) throw new CrmError("Connection changed. Create a fresh preview.");
      if (rows.length) await tx.insert(items).values(rows).onConflictDoNothing();
      await tx.update(batches).set({ nextPage: batch.nextPage + 1, hasMore: page.hasMore, discoveryStatus: page.hasMore ? "queued" : "done", discoveryError: null, discoveryRetryAt: new Date(), discoveryLeaseId: null, discoveryLockedAt: null }).where(guard);
    });
  } catch (error) {
    await db.update(batches).set({ discoveryStatus: error instanceof CrmRetry ? "queued" : "failed", discoveryError: error instanceof CrmError ? error.message : "Could not fetch the next source page. Retry fetching to resume.", discoveryRetryAt: error instanceof CrmRetry ? error.retryAt : new Date(), discoveryLeaseId: null, discoveryLockedAt: null }).where(guard);
  }
}
