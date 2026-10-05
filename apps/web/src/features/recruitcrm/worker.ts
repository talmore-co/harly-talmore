import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db, recruitCrmImportItems as items, recruitCrmImportBatches as batches } from "@harly/db";
import { z } from "zod";
import { candidateSchema, educationSchema, noteSchema, pageSchema, userSchema, workSchema } from "./contracts";
import { connected, CrmError, CrmRetry, request } from "./client";
import { importAccess } from "./access";
import { saveCandidate } from "./service";
import { copyCv } from "./cv";
import { discoverRecruitCrmPage } from "./discovery";

export async function processRecruitCrmImports() {
  const started = Date.now(); let processed = 0;
  await discoverRecruitCrmPage();
  for (let n = 0; n < 12 && Date.now() - started < 45_000; n++) {
    const item = await db.transaction(async tx => {
      const [row] = await tx.select().from(items).where(and(lte(items.retryAt, new Date()), or(eq(items.status, "queued"), and(eq(items.status, "processing"), lt(items.lockedAt, new Date(Date.now() - 5 * 60_000)))))).orderBy(sql`case when ${items.step} = 'profile' then 1 else 0 end`, items.retryAt, items.createdAt).limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      const [claimed] = await tx.update(items).set({ status: "processing", leaseId: randomUUID(), lockedAt: new Date() }).where(eq(items.id, row.id)).returning(); return claimed;
    });
    if (!item?.leaseId) break;
    const guard = and(eq(items.id, item.id), eq(items.leaseId, item.leaseId));
    try {
      const [batch] = await db.select().from(batches).where(and(eq(batches.id, item.batchId), eq(batches.workspaceId, item.workspaceId)));
      if (!batch || batch.expiresAt.getTime() < Date.now()) throw new CrmError("Import expired. Create a fresh preview.");
      await importAccess(batch.workspaceId, batch.actorId, batch.jobId, batch.stageId, item.candidateId || undefined);
      const connection = await connected(batch.workspaceId, batch.connectionId);
      if (connection.revision !== batch.connectionRevision) throw new CrmError("Connection changed. Create a fresh preview.");
      const read = <T>(path: string, schema: z.ZodType<T>) => request(batch.workspaceId, batch.connectionId, batch.connectionRevision, path, schema);
      let step = item.step; const detail = { ...item.detail };
      const path = `candidates/${encodeURIComponent(item.externalSlug)}`;
      if (step === "profile") {
        const users = await read("users", z.array(userSchema));
        if (!users.some(user => user.id === connection.accountAnchor)) throw new CrmError("The Recruit CRM account identity changed. Check the connection.");
        if (batch.includeNotes) detail.authors = Object.fromEntries(users.map(user => [user.id, [user.first_name, user.last_name].filter(Boolean).join(" ")]));
        const profile = await read(path, candidateSchema);
        if (profile.slug !== item.externalSlug) throw new CrmError("Recruit CRM returned a mismatched identity.");
        detail.profile = profile; step = "work";
      } else if (step === "work") { detail.work = await read(`${path}/work-history`, z.array(workSchema)); step = "education"; }
      else if (step === "education") { detail.education = await read(`${path}/education-history`, z.array(educationSchema)); step = batch.includeNotes ? "notes" : "save"; }
      else if (step === "notes") {
        const page = Number(detail.notesPage || 1);
        if (page > 100) throw new CrmError("This candidate has too many notes for one import. Import without notes or narrow the source.");
        const result = await read(`notes/search?related_to=${encodeURIComponent(item.externalSlug)}&related_to_type=candidate&limit=100&page=${page}`, pageSchema(noteSchema));
        detail.notes = [...z.array(noteSchema).parse(detail.notes || []), ...result.data];
        detail.notesPage = page + 1; step = result.hasMore ? "notes" : "save";
      } else if (step === "save") {
        await saveCandidate(batch, item.id, item.leaseId);
        await db.update(items).set({ lockedAt: null, leaseId: null, retryAt: new Date() }).where(guard);
        processed++; continue;
      } else if (step === "cv") { await copyCv(item, batch.actorId, item.leaseId); step = "done"; }
      else throw new CrmError("Import step is invalid.");
      await db.update(items).set({ detail, step, status: step === "done" ? "imported" : "queued", reason: null, leaseId: null, lockedAt: null, retryAt: new Date() }).where(guard);
      processed++;
    } catch (error) {
      await db.update(items).set({ status: error instanceof CrmRetry ? "queued" : item.candidateId ? "partial" : "failed", reason: error instanceof CrmError ? error.message : "Could not import this record. Retry this item.", retryAt: error instanceof CrmRetry ? error.retryAt : new Date(), leaseId: null, lockedAt: null }).where(guard);
    }
  }
  // Preview and work payloads are short-lived; retained receipts contain no source snapshots.
  const expired = await db.select({ id: batches.id }).from(batches).where(and(
    lt(batches.expiresAt, new Date()),
    or(lt(batches.createdAt, new Date(Date.now() - 30 * 86400000)), sql`exists (select 1 from recruitcrm_import_items i where i.batch_id = ${batches.id} and i.snapshot <> '{}'::jsonb)`),
  )).limit(100);
  if (expired.length) {
    const ids = expired.map(row => row.id);
    await db.update(items).set({ snapshot: {}, detail: {}, status: sql`case when ${items.status} in ('imported', 'skipped') then ${items.status} else 'expired' end` }).where(and(inArray(items.batchId, ids), sql`${items.snapshot} <> '{}'::jsonb`, or(sql`${items.lockedAt} is null`, lt(items.lockedAt, new Date(Date.now() - 5 * 60_000)))));
    await db.delete(batches).where(and(inArray(batches.id, ids), lt(batches.createdAt, new Date(Date.now() - 30 * 86400000))));
  }
  return { processed };
}
