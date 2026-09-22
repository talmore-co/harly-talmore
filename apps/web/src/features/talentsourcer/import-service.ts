import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { activityEvents, applications, applicationStageHistory, candidates, candidateNotes, db, jobs, jobStages, talentSourcerCandidateLinks as links, talentSourcerConnections as connections, talentSourcerImportBatches as batches, talentSourcerImportItems as items } from "@harly/db";
import { requireCandidatePermission } from "@/features/workspaces/permissions-server";
import type { WorkspaceContext } from "@/features/workspaces/context";
import { exportSchema, sourceCandidateSchema, sourcePage, sourceRequest, sourceResources, TalentSourcerError } from "./client";
import { verifiedConnection } from "./connection";
import { importProfile } from "./profile";
import { lockApplicationPipelineOrder } from "@/features/applications/pipeline-order";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Store = Transaction | typeof db;
export type ImportSelection = { organizationId: string; jobId: string; stageId: string; projectId: string; sourceId: string; kind: "shortlist" | "interested"; cursor?: string };
const terminal = (name: string) => ["hired", "rejected", "rejected by client"].includes(name.trim().toLowerCase());

async function destination(store: Store, workspaceId: string, jobId: string, stageId: string) {
  const [row] = await store.select({ job: jobs, stage: jobStages }).from(jobs).innerJoin(jobStages, and(eq(jobStages.jobId, jobs.id), eq(jobStages.workspaceId, workspaceId))).where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, jobId), isNull(jobs.deletedAt), eq(jobs.status, "open"), eq(jobStages.id, stageId))).for("share");
  if (!row || terminal(row.stage.name)) throw new TalentSourcerError("Choose an active stage in an open job.");
  return row;
}

async function matchCandidate(store: Store, workspaceId: string, organizationId: string, externalId: string, profile: ReturnType<typeof importProfile>) {
  const [link] = await store.select().from(links).where(and(eq(links.workspaceId, workspaceId), eq(links.organizationId, organizationId), eq(links.externalCandidateId, externalId)));
  const signals = [link ? eq(candidates.id, link.candidateId) : undefined, profile.email ? sql`lower(${candidates.email}) = ${profile.email}` : undefined,
    profile.linkedinUrl ? sql`lower(rtrim(regexp_replace(split_part(split_part(trim(${candidates.linkedinUrl}), '?', 1), '#', 1), '^(https?://)?([a-z]+[.])?linkedin[.]com/', 'https://www.linkedin.com/', 'i'), '/')) = ${profile.linkedinUrl}` : undefined].filter(Boolean);
  if (!signals.length) return null;
  const found = await store.select().from(candidates).where(and(eq(candidates.workspaceId, workspaceId), or(...signals))).orderBy(candidates.id).limit(3).for("update");
  if (found.length > 1) throw new TalentSourcerError("Conflicting candidate identities. Review and merge duplicates before importing.");
  const candidate = found[0];
  if (candidate?.deletedAt || candidate?.anonymizedAt) throw new TalentSourcerError("This candidate was deleted or anonymized. Review their record before importing.");
  return candidate ?? null;
}

export async function previewImport(context: WorkspaceContext, selection: ImportSelection) {
  const workspaceId = context.organization.id;
  const connection = await verifiedConnection(workspaceId, selection.organizationId);
  await destination(db, workspaceId, selection.jobId, selection.stageId);
  const sources = await sourceResources(connection.token, `${selection.kind === "shortlist" ? "shortlists" : "campaigns"}?projectId=${encodeURIComponent(selection.projectId)}`);
  if (!sources.some(source => source.id === selection.sourceId)) throw new TalentSourcerError("The selected source is not in this project.");
  const path = `${selection.kind === "shortlist" ? "shortlists" : "campaigns"}/${encodeURIComponent(selection.sourceId)}/candidates${selection.kind === "interested" ? "?replyDisposition=interested" : ""}`;
  const page = await sourcePage(connection.token, path, sourceCandidateSchema, selection.cursor);
  if (page.page.some(row => row.organizationId !== connection.organizationId || row.projectId !== selection.projectId)) throw new TalentSourcerError("TalentSourcer returned candidates outside the selected workspace or project.");
  const prepared: Array<{ externalCandidateId: string; profile: Record<string, unknown>; status: string; reason: string | null; candidateId?: string }> = [];
  const sourceRows = [...new Map(page.page.map(row => [row.candidateId, row])).values()];
  for (let offset = 0; offset < sourceRows.length; offset += 5) {
    await Promise.all(sourceRows.slice(offset, offset + 5).map(async source => {
    // Verify interest even if an older provider deployment ignores the filter.
    if (selection.kind === "interested" && source.replyDisposition !== "interested") return;
    try {
      const exported = await sourceRequest(connection.token, `candidates/${encodeURIComponent(source.candidateId)}/export`, exportSchema);
      if (exported.organizationId !== connection.organizationId || exported.candidateId !== source.candidateId) throw new TalentSourcerError("TalentSourcer returned a mismatched candidate identity.");
      const profile = importProfile(exported);
      const candidate = await matchCandidate(db, workspaceId, connection.organizationId, source.candidateId, profile);
      if (candidate) await requireCandidatePermission("candidates:edit", candidate.id, context);
      const [application] = candidate ? await db.select({ id: applications.id }).from(applications).where(and(eq(applications.workspaceId, workspaceId), eq(applications.candidateId, candidate.id), eq(applications.jobId, selection.jobId))) : [];
      prepared.push({ externalCandidateId: source.candidateId, profile: { exported, source, name: `${profile.firstName} ${profile.lastName}`.trim(), email: profile.email, headline: profile.headline }, candidateId: candidate?.id, status: application ? "skipped" : "ready", reason: application ? "Already in this job's pipeline; its stage will not change." : candidate ? "Link existing candidate to this job; saved profile stays unchanged." : null });
    } catch (error) {
      prepared.push({ externalCandidateId: source.candidateId, profile: { name: source.fullName || "Candidate" }, status: "skipped", reason: error instanceof TalentSourcerError ? error.message : "Could not access or validate this candidate. Review their source record and access permissions." });
    }
    }));
  }
  prepared.sort((a, b) => sourceRows.findIndex(row => row.candidateId === a.externalCandidateId) - sourceRows.findIndex(row => row.candidateId === b.externalCandidateId));
  const batch = await db.transaction(async tx => {
    const [batch] = await tx.insert(batches).values({ workspaceId, actorId: context.user.id, connectionRevision: connection.revision, organizationId: connection.organizationId, jobId: selection.jobId, stageId: selection.stageId, source: { projectId: selection.projectId, sourceId: selection.sourceId, kind: selection.kind }, expiresAt: new Date(Date.now() + 30 * 60_000) }).returning();
    if (prepared.length) await tx.insert(items).values(prepared.map(row => ({ ...row, workspaceId, batchId: batch.id })));
    return batch;
  });
  return { batchId: batch.id, rows: await importResults(batch.id), continueCursor: page.continueCursor, isDone: page.isDone };
}

export async function importResults(batchId: string) {
  const rows = await db.select().from(items).where(eq(items.batchId, batchId));
  return rows.map(row => ({ id: row.id, name: String(row.profile.name || "Candidate"), email: typeof row.profile.email === "string" ? row.profile.email : null, headline: typeof row.profile.headline === "string" ? row.profile.headline : null, status: row.status, reason: row.reason, candidateId: row.candidateId }));
}

export async function executeImport(context: WorkspaceContext, batch: typeof batches.$inferSelect, selectedIds: string[]) {
  const connection = await verifiedConnection(context.organization.id, batch.organizationId);
  if (connection.revision !== batch.connectionRevision || connection.organizationId !== batch.organizationId) throw new TalentSourcerError("The connection changed. Load a fresh preview.");
  if (batch.expiresAt.getTime() <= Date.now()) throw new TalentSourcerError("This preview expired. Load a fresh preview before importing.");
  const selected = await db.select().from(items).where(and(eq(items.batchId, batch.id), inArray(items.id, selectedIds)));
  for (const item of selected) {
    if (!["ready", "failed"].includes(item.status)) continue;
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`talentsourcer-import:${context.organization.id}`}, 0))`);
        const [currentConnection] = await tx.select().from(connections).where(and(eq(connections.workspaceId, context.organization.id), eq(connections.organizationId, batch.organizationId))).for("share");
        if (!currentConnection?.token || currentConnection.revision !== batch.connectionRevision) throw new TalentSourcerError("The connection changed. Load a fresh preview.");
        const [current] = await tx.select().from(items).where(and(eq(items.id, item.id), eq(items.batchId, batch.id))).for("update");
        if (!current || !["ready", "failed"].includes(current.status)) return;
        const target = await destination(tx, context.organization.id, batch.jobId, batch.stageId);
        const exported = exportSchema.parse(current.profile.exported);
        const profile = importProfile(exported);
        let candidate = await matchCandidate(tx, context.organization.id, batch.organizationId, current.externalCandidateId, profile);
        if (candidate) await requireCandidatePermission("candidates:edit", candidate.id, context);
        if (!candidate) {
          const dateText = (value?: { year: number; month: number }) => value ? `${value.year}-${String(value.month).padStart(2, "0")}` : null;
          [candidate] = await tx.insert(candidates).values({ workspaceId: context.organization.id, ...profile,
            experienceEntries: (exported.profile.employmentHistory || []).filter(row => row.company && row.title).map(row => ({ id: randomUUID(), company: row.company!, title: row.title!, description: row.description || null, location: row.location || null, current: row.isCurrent ?? null, startDate: dateText(row.startsAt), endDate: dateText(row.endsAt) })),
            educationEntries: (exported.profile.education || []).filter(row => row.school).map(row => ({ id: randomUUID(), school: row.school!, degree: row.degreeName || null, field: row.fieldOfStudy || null, description: row.description || null, startDate: dateText(row.startsAt), endDate: dateText(row.endsAt) })),
          }).returning();
        }
        const [application] = await tx.select().from(applications).where(and(eq(applications.workspaceId, context.organization.id), eq(applications.candidateId, candidate.id), eq(applications.jobId, batch.jobId)));
        await tx.insert(links).values({ workspaceId: context.organization.id, organizationId: batch.organizationId, externalCandidateId: current.externalCandidateId, candidateId: candidate.id }).onConflictDoNothing();
        if (application) {
          await tx.update(items).set({ status: "skipped", reason: "Already in this job's pipeline; no changes made.", candidateId: candidate.id, applicationId: application.id }).where(eq(items.id, current.id));
          return;
        }
        await lockApplicationPipelineOrder(tx, context.organization.id, batch.stageId);
        const [order] = await tx.select({ value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1` }).from(applications).where(and(eq(applications.workspaceId, context.organization.id), eq(applications.currentStageId, batch.stageId)));
        const [created] = await tx.insert(applications).values({ workspaceId: context.organization.id, candidateId: candidate.id, jobId: batch.jobId, currentStageId: batch.stageId, pipelineOrder: order.value, status: "active", source: "talentsourcer", appliedAt: new Date() }).returning();
        await tx.insert(applicationStageHistory).values({ workspaceId: context.organization.id, applicationId: created.id, fromStageId: null, toStageId: batch.stageId, movedById: context.user.id });
        const source = sourceCandidateSchema.parse(current.profile.source);
        const notes = ["Imported from TalentSourcer AI", `Project: ${batch.source.projectId}`, source.replyDisposition ? `Interest: ${source.replyDisposition}${source.replyDispositionSource ? ` (${source.replyDispositionSource})` : ""}` : null, exported.privateContext.notes, source.notes, exported.privateContext.resumeData ? `Source resume context:\n${exported.privateContext.resumeData}` : null].filter(Boolean).join("\n\n");
        await tx.insert(candidateNotes).values({ workspaceId: context.organization.id, candidateId: candidate.id, authorId: context.user.id, body: notes, workflowEffectId: `talentsourcer:${batch.id}:${current.id}` });
        // Imports are silent. This is a distinct activity, not application.created,
        // so application-created workflows cannot send unintended outreach.
        await tx.insert(activityEvents).values({ workspaceId: context.organization.id, actorId: context.user.id, entityType: "application", entityId: created.id, type: "application.imported", metadata: { source: "talentsourcer", batchId: batch.id, organizationId: batch.organizationId, externalCandidateId: current.externalCandidateId, ...batch.source, sourceShortlistId: source.sourceShortlistId, jobTitle: target.job.title, candidateName: `${candidate.firstName} ${candidate.lastName}`.trim(), replyDisposition: source.replyDisposition, replyDispositionSource: source.replyDispositionSource, replyDispositionUpdatedAt: source.replyDispositionUpdatedAt } });
        await tx.update(items).set({ status: "imported", reason: null, candidateId: candidate.id, applicationId: created.id }).where(eq(items.id, current.id));
      });
    } catch (error) {
      await db.update(items).set({ status: "failed", reason: error instanceof TalentSourcerError ? error.message : "Could not import this candidate. Check permissions and retry." }).where(and(eq(items.id, item.id), inArray(items.status, ["ready", "failed"])));
    }
  }
  return importResults(batch.id);
}
