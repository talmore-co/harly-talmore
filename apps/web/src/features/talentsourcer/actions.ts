"use server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, jobs, jobStages, talentSourcerConnections, talentSourcerImportBatches } from "@harly/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireJobPermission, requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret } from "@/lib/crypto";
import { databaseUuidSchema } from "@/lib/database-uuid";
import { connectionSchema, missingImportScopes, sourceRequest, sourceResources, TalentSourcerError } from "./client";
import { connectionStatus, verifiedConnection } from "./connection";
import { executeImport, previewImport } from "./import-service";

const sourceOrganizationSchema = z.string().min(1).max(256);
const selectionSchema = z.object({ organizationId: sourceOrganizationSchema, jobId: databaseUuidSchema, stageId: databaseUuidSchema, projectId: z.string().min(1).max(256), sourceId: z.string().min(1).max(256), kind: z.enum(["shortlist", "interested"]), cursor: z.string().max(10_000).optional() });

export async function previewTalentSourcerImport(input: z.input<typeof selectionSchema>) {
  const selection = selectionSchema.parse(input);
  const context = await requireJobPermission("candidates:edit", selection.jobId);
  try { return { ok: true as const, ...await previewImport(context, selection) }; }
  catch (error) { return { ok: false as const, error: error instanceof TalentSourcerError ? error.message : "Could not prepare this import." }; }
}

export async function submitTalentSourcerImport(input: { batchId: string; itemIds: string[] }) {
  const parsed = z.object({ batchId: databaseUuidSchema, itemIds: z.array(databaseUuidSchema).min(1).max(50) }).parse(input);
  const context = await requirePermission("candidates:edit");
  const [batch] = await db.select().from(talentSourcerImportBatches).where(and(eq(talentSourcerImportBatches.id, parsed.batchId), eq(talentSourcerImportBatches.workspaceId, context.organization.id), eq(talentSourcerImportBatches.actorId, context.user.id)));
  if (!batch) return { ok: false as const, error: "Import preview not found. Load a fresh preview." };
  await requireJobPermission("candidates:edit", batch.jobId, context);
  try {
    const rows = await executeImport(context, batch, parsed.itemIds);
    revalidatePath("/dashboard/candidates");
    revalidatePath("/dashboard/pipeline");
    return { ok: true as const, rows };
  } catch (error) { return { ok: false as const, error: error instanceof TalentSourcerError ? error.message : "Could not complete this import. Retry using this preview." }; }
}

export async function getTalentSourcerStatus() {
  const context = await requirePermission("integrations:manage");
  return connectionStatus(context.organization.id);
}
export async function connectTalentSourcer(tokenInput: string, expectedOrganizationId?: string) {
  const context = await requirePermission("integrations:manage");
  try {
    const token = z.string().trim().min(1).max(4096).parse(tokenInput);
    const identity = await sourceRequest(token, "connection", connectionSchema);
    if (expectedOrganizationId && identity.organization.id !== sourceOrganizationSchema.parse(expectedOrganizationId)) return { ok: false, error: "This token belongs to a different TalentSourcer workspace. Use Add workspace to connect it separately." };
    const missing = missingImportScopes(identity.scopes);
    if (missing.length) return { ok: false, error: `Add these token scopes: ${missing.join(", ")}.` };
    const values = { organizationId: identity.organization.id, organizationName: identity.organization.name, token: encryptSecret(token), connectedById: context.user.id, checkedAt: new Date(), revision: randomUUID() };
    await db.insert(talentSourcerConnections).values({ workspaceId: context.organization.id, ...values }).onConflictDoUpdate({ target: [talentSourcerConnections.workspaceId, talentSourcerConnections.organizationId], set: values });
    revalidatePath("/settings/integrations");
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof TalentSourcerError ? error.message : "Could not save the TalentSourcer connection." }; }
}
export async function disconnectTalentSourcer(organizationId: string) {
  const context = await requirePermission("integrations:manage");
  sourceOrganizationSchema.parse(organizationId);
  await db.update(talentSourcerConnections).set({ token: null, revision: randomUUID() }).where(and(eq(talentSourcerConnections.workspaceId, context.organization.id), eq(talentSourcerConnections.organizationId, organizationId)));
  revalidatePath("/settings/integrations");
}
export async function checkTalentSourcer(organizationId: string) {
  const context = await requirePermission("integrations:manage");
  sourceOrganizationSchema.parse(organizationId);
  try {
    const row = await verifiedConnection(context.organization.id, organizationId);
    await db.update(talentSourcerConnections).set({ checkedAt: new Date() }).where(and(eq(talentSourcerConnections.workspaceId, context.organization.id), eq(talentSourcerConnections.organizationId, organizationId), eq(talentSourcerConnections.revision, row.revision)));
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof TalentSourcerError ? error.message : "Connection check failed." }; }
}

export async function talentSourcerImportOptions(jobId: string, projectId?: string, organizationId?: string) {
  databaseUuidSchema.parse(jobId);
  const context = await requireJobPermission("candidates:edit", jobId);
  try {
    const status = await connectionStatus(context.organization.id);
    const connections = status.connections.filter(row => row.connected).map(row => ({ id: row.organizationId, name: row.organizationName }));
    const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, context.organization.id), eq(jobs.status, "open"), isNull(jobs.deletedAt)));
    if (!job) throw new TalentSourcerError("Choose an open job.");
    const stages = (await db.select({ id: jobStages.id, name: jobStages.name }).from(jobStages).where(and(eq(jobStages.workspaceId, context.organization.id), eq(jobStages.jobId, jobId))).orderBy(asc(jobStages.order))).filter(stage => !["hired", "rejected", "rejected by client"].includes(stage.name.trim().toLowerCase()));
    if (!organizationId) return { ok: true as const, stages, connections, projects: [], shortlists: [], campaigns: [] };
    sourceOrganizationSchema.parse(organizationId);
    const connection = await verifiedConnection(context.organization.id, organizationId);
    const projects = await sourceResources(connection.token, "projects");
    if (projectId && !projects.some(project => project.id === projectId)) throw new TalentSourcerError("Choose an accessible TalentSourcer project.");
    const [shortlists, campaigns] = projectId ? await Promise.all([
      sourceResources(connection.token, `shortlists?projectId=${encodeURIComponent(projectId)}`),
      sourceResources(connection.token, `campaigns?projectId=${encodeURIComponent(projectId)}`),
    ]) : [[], []];
    return { ok: true as const, stages, connections, projects, shortlists, campaigns };
  } catch (error) { return { ok: false as const, error: error instanceof TalentSourcerError ? error.message : "Could not load import options." }; }
}
