"use server";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, jobs, jobStages, recruitCrmConnections as connections, recruitCrmImportBatches as batches, recruitCrmImportItems as items } from "@harly/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireJobPermission, requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret } from "@/lib/crypto";
import { databaseUuidSchema as uuid } from "@/lib/database-uuid";
import { candidateSchema, jobSchema, pageSchema, restrictions, userSchema } from "./contracts";
import { candidateValues } from "./profile";
import { connected, crmRequest, CrmError, request } from "./client";
import { importAccess } from "./access";
import { findMatch } from "./service";
import { sourcePage, type SourceSelection } from "./browse";

const safeError = (error: unknown) => error instanceof CrmError ? error.message : "The Recruit CRM request could not be completed. Check your access and try again.";
export async function getRecruitCrmConnections() {
  const context = await requirePermission("integrations:manage");
  return connectionList(context.organization.id);
}
async function connectionList(workspaceId: string) {
  return db.select({ id: connections.id, name: connections.name, connected: sql<boolean>`${connections.token} is not null`, checkedAt: connections.checkedAt }).from(connections).where(eq(connections.workspaceId, workspaceId)).orderBy(asc(connections.name));
}
export async function saveRecruitCrmConnection(input: { name: string; token: string; id?: string }) {
  const context = await requirePermission("integrations:manage");
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(100), token: z.string().trim().min(1).max(4096), id: uuid.optional() }).parse(input);
    const users = await crmRequest(parsed.token, "users", z.array(userSchema));
    if (!users.length) throw new CrmError("The token did not expose an account user identity.");
    let anchor = [...users].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))[0].id;
    if (parsed.id) {
      const [existing] = await db.select().from(connections).where(and(eq(connections.workspaceId, context.organization.id), eq(connections.id, parsed.id)));
      if (!existing || !users.some(user => user.id === existing.accountAnchor)) throw new CrmError("This token does not match the saved Recruit CRM account. Add a separate connection.");
      anchor = existing.accountAnchor;
    }
    const values = { name: parsed.name, token: encryptSecret(parsed.token), revision: randomUUID(), checkedAt: new Date(), retryAt: null };
    await db.insert(connections).values({ workspaceId: context.organization.id, accountAnchor: anchor, ...values }).onConflictDoUpdate({ target: [connections.workspaceId, connections.accountAnchor], set: values });
    revalidatePath("/settings/integrations"); return { ok: true as const };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function disconnectRecruitCrm(id: string) {
  const context = await requirePermission("integrations:manage"); uuid.parse(id);
  await db.update(connections).set({ token: null, revision: randomUUID() }).where(and(eq(connections.workspaceId, context.organization.id), eq(connections.id, id)));
  revalidatePath("/settings/integrations");
}
export async function checkRecruitCrm(id: string) {
  const context = await requirePermission("integrations:manage"); uuid.parse(id);
  try {
    const connection = await connected(context.organization.id, id);
    const users = await request(context.organization.id, id, connection.revision, "users", z.array(userSchema));
    if (!users.some(user => user.id === connection.accountAnchor)) throw new CrmError("Account identity changed. Check this connection's token.");
    await db.update(connections).set({ checkedAt: new Date() }).where(and(eq(connections.id, id), eq(connections.revision, connection.revision)));
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function recruitCrmOptions(jobId?: string) {
  const context = await requirePermission("candidates:edit");
  if (jobId) await requireJobPermission("candidates:edit", uuid.parse(jobId));
  const stages = jobId ? await db.select({ id: jobStages.id, name: jobStages.name }).from(jobStages).innerJoin(jobs, and(eq(jobs.id, jobStages.jobId), eq(jobs.workspaceId, context.organization.id), isNull(jobs.deletedAt), eq(jobs.status, "open"))).where(and(eq(jobStages.workspaceId, context.organization.id), eq(jobStages.jobId, uuid.parse(jobId)))).orderBy(asc(jobStages.order)) : [];
  return { connections: (await connectionList(context.organization.id)).filter(row => row.connected), stages: stages.filter(stage => !["hired", "rejected", "rejected by client"].includes(stage.name.trim().toLowerCase())) };
}
export async function browseRecruitCrmResources(connectionId: string, kind: "jobs" | "users", page = 1) {
  const context = await requirePermission("candidates:edit"); uuid.parse(connectionId); z.enum(["jobs", "users"]).parse(kind); z.number().int().min(1).max(10000).parse(page);
  try {
    const c = await connected(context.organization.id, connectionId);
    if (kind === "users") {
      const users = await request(context.organization.id, connectionId, c.revision, "users", z.array(userSchema));
      return { ok: true as const, rows: users.map(user => ({ id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.id })), hasMore: false };
    }
    const result = await request(context.organization.id, connectionId, c.revision, `jobs?limit=100&page=${page}`, pageSchema(jobSchema));
    return { ok: true as const, rows: result.data.map(job => ({ id: job.slug, name: job.name })), hasMore: result.hasMore };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
const previewSchema = z.object({ connectionId: uuid, jobId: uuid.nullable(), stageId: uuid.nullable(), sourceKind: z.enum(["search", "job"]), sourceJob: z.string().max(256).optional(), field: z.enum(["first_name", "last_name", "email", "linkedin", "position", "city", "country"]).default("first_name"), query: z.string().trim().max(300).default(""), ownerId: z.string().max(100).optional(), statusId: z.string().regex(/^[\d,]*$/).optional(), page: z.number().int().min(1).max(10000).default(1), includeNotes: z.boolean(), includeCv: z.boolean() });
export async function previewRecruitCrm(input: z.input<typeof previewSchema>) {
  const context = await requirePermission("candidates:edit");
  try {
    const parsed = previewSchema.parse(input); const workspaceId = context.organization.id;
    await importAccess(workspaceId, context.user.id, parsed.jobId, parsed.stageId);
    const c = await connected(workspaceId, parsed.connectionId);
    const source: SourceSelection = { version: 1, kind: parsed.sourceKind, jobSlug: parsed.sourceKind === "job" ? parsed.sourceJob : undefined, field: parsed.field, query: parsed.query, ownerId: parsed.ownerId, statusId: parsed.statusId };
    const rows = await sourcePage(workspaceId, c.id, c.revision, source, 1, 25);
    if (rows.data.length > 100) throw new CrmError("Recruit CRM returned too many candidates. Narrow the search.");
    const prepared: { workspaceId: string; externalSlug: string; snapshot: Record<string, unknown>; status: string; reason: string | null }[] = [];
    for (const row of new Map(rows.data.map(row => [row.slug, row])).values()) {
      let reason: string | null = null; let status = "ready";
      try {
        const values = candidateValues(row); const match = await findMatch(db, workspaceId, c.id, row.slug, values);
        if (match) { await importAccess(workspaceId, context.user.id, parsed.jobId, parsed.stageId, match.id); reason = "Matches an existing candidate. Saved profile and any existing stage will be preserved."; }
      } catch (error) { status = "skipped"; reason = error instanceof Error ? (error instanceof CrmError ? error.message : "Profile is missing a name or has an invalid email.") : "Unavailable"; }
      prepared.push({ workspaceId, externalSlug: row.slug, snapshot: row as Record<string, unknown>, status, reason });
    }
    const batch = await db.transaction(async tx => {
      const [batch] = await tx.insert(batches).values({ workspaceId, actorId: context.user.id, connectionId: c.id, connectionRevision: c.revision, jobId: parsed.jobId, stageId: parsed.stageId, source, hasMore: rows.hasMore, includeNotes: parsed.includeNotes, includeCv: parsed.includeCv, expiresAt: new Date(Date.now() + 30 * 60_000) }).returning();
      if (prepared.length) await tx.insert(items).values(prepared.map(row => ({ ...row, batchId: batch.id })));
      return batch;
    });
    return { ok: true as const, batchId: batch.id, rows: await results(batch.id), hasMore: rows.hasMore };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
function previewRestrictions(snapshot: Record<string, unknown>) {
  const profile = candidateSchema.safeParse(snapshot);
  if (!profile.success) return { optedOut: false, offLimits: false };
  const flags = restrictions(profile.data);
  return { optedOut: flags.emailOptedOut, offLimits: flags.contactOffLimits };
}
async function results(batchId: string, limit = 100_000) {
  const rows = await db.select().from(items).where(eq(items.batchId, batchId)).orderBy(asc(items.createdAt), asc(items.externalSlug)).limit(limit);
  return rows.map(row => ({ id: row.id, name: [row.snapshot.first_name, row.snapshot.last_name].filter(Boolean).join(" ") || "Candidate", email: typeof row.snapshot.email === "string" ? row.snapshot.email : null, headline: typeof row.snapshot.position === "string" ? row.snapshot.position : null, status: row.status, step: row.step, reason: row.reason, hasCv: Boolean(row.snapshot.resume), ...previewRestrictions(row.snapshot), candidateId: row.candidateId }));
}
export async function recruitCrmBatchStatus(batchId: string) {
  const context = await requirePermission("candidates:edit"); uuid.parse(batchId);
  const [batch] = await db.select().from(batches).where(and(eq(batches.id, batchId), eq(batches.workspaceId, context.organization.id), eq(batches.actorId, context.user.id)));
  if (!batch) throw new Error("Import not found.");
  await importAccess(context.organization.id, context.user.id, batch.jobId, batch.stageId);
  return results(batchId, batch.importAll ? 100 : undefined);
}
async function ownedBatch(batchId: string) {
  uuid.parse(batchId);
  const context = await requirePermission("candidates:edit");
  const [batch] = await db.select().from(batches).where(and(eq(batches.id, batchId), eq(batches.workspaceId, context.organization.id), eq(batches.actorId, context.user.id)));
  if (!batch) throw new CrmError("Import not found.");
  await importAccess(batch.workspaceId, batch.actorId, batch.jobId, batch.stageId);
  return batch;
}
async function editableBatch(batchId: string) {
  const batch = await ownedBatch(batchId);
  if (batch.expiresAt.getTime() < Date.now()) throw new CrmError("Import expired. Create a fresh preview.");
  if (batch.source.version !== 1) throw new CrmError("Create a fresh preview to save your search filters.");
  const connection = await connected(batch.workspaceId, batch.connectionId);
  if (connection.revision !== batch.connectionRevision) throw new CrmError("Connection changed. Create a fresh preview.");
  return batch;
}

export async function fetchMoreRecruitCrm(batchId: string) {
  try {
    const batch = await editableBatch(batchId);
    if (batch.importAll) throw new CrmError("All matching candidates are already being imported in the background.");
    if (!batch.hasMore) return { ok: true as const, batchId, rows: await results(batchId), hasMore: false };
    const page = await sourcePage(batch.workspaceId, batch.connectionId, batch.connectionRevision, batch.source, batch.nextPage, 25);
    const prepared: (typeof items.$inferInsert)[] = [];
    for (const row of page.data) {
      let status = "ready"; let reason: string | null = null;
      try {
        const match = await findMatch(db, batch.workspaceId, batch.connectionId, row.slug, candidateValues(row));
        if (match) { await importAccess(batch.workspaceId, batch.actorId, batch.jobId, batch.stageId, match.id); reason = "Matches an existing candidate. Saved profile and any existing stage will be preserved."; }
      } catch (error) { status = "skipped"; reason = error instanceof CrmError ? error.message : "Profile is missing a name or has an invalid email."; }
      prepared.push({ workspaceId: batch.workspaceId, batchId, externalSlug: row.slug, snapshot: row as Record<string, unknown>, status, reason });
    }
    await db.transaction(async tx => {
      const [current] = await tx.select().from(batches).where(eq(batches.id, batchId)).for("update");
      if (!current || current.importAll || current.nextPage !== batch.nextPage) return;
      if (prepared.length) await tx.insert(items).values(prepared).onConflictDoNothing();
      await tx.update(batches).set({ nextPage: batch.nextPage + 1, hasMore: page.hasMore }).where(eq(batches.id, batchId));
    });
    const current = await ownedBatch(batchId);
    return { ok: true as const, batchId, rows: await results(batchId, current.importAll ? 100 : undefined), hasMore: !current.importAll && current.hasMore };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}

/** No provider calls: freeze the saved preview filters and start durable discovery. */
export async function queueAllRecruitCrm(batchId: string) {
  try {
    await editableBatch(batchId);
    await db.transaction(async tx => {
      const [current] = await tx.select().from(batches).where(eq(batches.id, batchId)).for("update");
      if (!current) throw new CrmError("Import not found.");
      if (!current.importAll) {
        await tx.update(batches).set({ importAll: true, discoveryStatus: "queued", nextPage: 1, hasMore: true, discoveryRetryAt: new Date(), discoveryError: null, expiresAt: new Date(Date.now() + 7 * 86400000) }).where(eq(batches.id, batchId));
        await tx.update(items).set({ status: "queued", retryAt: new Date() }).where(and(eq(items.batchId, batchId), eq(items.status, "ready")));
      } else if (current.discoveryStatus === "failed") {
        await tx.update(batches).set({ discoveryStatus: "queued", discoveryError: null, discoveryRetryAt: new Date() }).where(eq(batches.id, batchId));
      }
    });
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}

export async function recruitCrmProgress(batchId: string) {
  const batch = await ownedBatch(batchId);
  const [destination] = batch.jobId ? await db.select({ job: jobs.title, stage: jobStages.name }).from(jobs).leftJoin(jobStages, eq(jobStages.id, batch.stageId!)).where(and(eq(jobs.id, batch.jobId), eq(jobs.workspaceId, batch.workspaceId))) : [];
  const [sourceConnection] = await db.select({ name: connections.name }).from(connections).where(and(eq(connections.id, batch.connectionId), eq(connections.workspaceId, batch.workspaceId)));
  const grouped = await db.select({ status: items.status, count: sql<number>`count(*)::int` }).from(items).where(eq(items.batchId, batchId)).groupBy(items.status);
  const counts = Object.fromEntries(grouped.map(row => [row.status, row.count]));
  return { importAll: batch.importAll, discoveryStatus: batch.discoveryStatus, discoveryError: batch.discoveryError, hasMore: batch.hasMore, counts, total: grouped.reduce((sum, row) => sum + row.count, 0), destinationLabel: destination ? `${destination.job} · ${destination.stage || "Stage unavailable"}` : "Talent pool", sourceLabel: `${sourceConnection?.name || "Recruit CRM"} · ${batch.source.kind === "job" ? `Source job ${batch.source.jobSlug}` : batch.source.query ? `${batch.source.field}: ${batch.source.query}` : "All candidates"}${batch.source.ownerId ? ` · Owner ${batch.source.ownerId}` : ""}`, rows: await results(batchId, batch.importAll ? 100 : undefined) };
}

export async function retryRecruitCrmFailures(batchId: string) {
  try {
    const batch = await editableBatch(batchId);
    await db.update(items).set({ status: "queued", retryAt: new Date() }).where(and(eq(items.batchId, batch.id), inArray(items.status, ["failed", "partial"])));
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function recentRecruitCrmImports() {
  const context = await requirePermission("candidates:edit");
  const rows = await db.select({ id: batches.id, createdAt: batches.createdAt, job: jobs.title, source: batches.source, candidates: sql<number>`(select count(*)::int from recruitcrm_import_items i where i.batch_id = ${batches.id} and i.status <> 'ready')` })
    .from(batches).leftJoin(jobs, eq(jobs.id, batches.jobId)).where(and(eq(batches.workspaceId, context.organization.id), eq(batches.actorId, context.user.id))).orderBy(desc(batches.createdAt)).limit(10);
  return rows.map(row => ({ id: row.id, createdAt: row.createdAt, destination: row.job || "Talent pool", source: row.source.kind === "job" ? "Source job" : row.source.query ? `"${row.source.query}"` : "All candidates", candidates: row.candidates }));
}
export async function queueRecruitCrmImport(batchId: string, itemIds: string[]) {
  const context = await requirePermission("candidates:edit"); uuid.parse(batchId); z.array(uuid).min(1).max(10_000).parse(itemIds);
  try {
    const [batch] = await db.select().from(batches).where(and(eq(batches.id, batchId), eq(batches.workspaceId, context.organization.id), eq(batches.actorId, context.user.id)));
    if (!batch || batch.expiresAt.getTime() < Date.now()) throw new CrmError("Import expired. Create a fresh preview.");
    await importAccess(context.organization.id, context.user.id, batch.jobId, batch.stageId);
    const connection = await connected(context.organization.id, batch.connectionId);
    if (connection.revision !== batch.connectionRevision) throw new CrmError("Connection changed. Create a fresh preview.");
    await db.transaction(async tx => {
      await tx.update(batches).set({ expiresAt: new Date(Date.now() + 7 * 86400000) }).where(eq(batches.id, batch.id));
      await tx.update(items).set({ status: "queued", retryAt: new Date() }).where(and(eq(items.batchId, batch.id), inArray(items.id, itemIds), inArray(items.status, ["ready", "failed", "partial"])));
    });
    return { ok: true as const, rows: await results(batchId) };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
