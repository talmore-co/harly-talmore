import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { applications, applicationStageHistory, activityEvents, candidateNotes, candidates, db, poolEntries, recruitCrmCandidateLinks as links, recruitCrmConnections as connections, recruitCrmImportBatches as batches, recruitCrmImportItems as items } from "@harly/db";
import { lockApplicationPipelineOrder } from "@/features/applications/pipeline-order";
import { importAccess } from "./access";
import { candidateSchema, noteSchema, restrictions } from "./contracts";
import { candidateValues, educationValues, workValues } from "./profile";
import { CrmError } from "./client";
import { z } from "zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function findMatch(store: Tx | typeof db, workspaceId: string, connectionId: string, slug: string, row: ReturnType<typeof candidateValues>) {
  const [link] = await store.select().from(links).where(and(eq(links.workspaceId, workspaceId), eq(links.connectionId, connectionId), eq(links.externalSlug, slug)));
  const signals = [link ? eq(candidates.id, link.candidateId) : undefined, row.email ? sql`lower(${candidates.email}) = ${row.email}` : undefined, row.linkedinUrl ? sql`lower(rtrim(regexp_replace(split_part(split_part(trim(${candidates.linkedinUrl}), '?', 1), '#', 1), '^(https?://)?([a-z]+[.])?linkedin[.]com/', 'https://www.linkedin.com/', 'i'), '/')) = ${row.linkedinUrl}` : undefined].filter(Boolean);
  if (!signals.length) return null;
  const matches = await store.select().from(candidates).where(and(eq(candidates.workspaceId, workspaceId), or(...signals))).orderBy(candidates.id).limit(3).for("update");
  if (matches.length > 1) throw new CrmError("Conflicting identities. Review the candidate records before importing.");
  if (matches[0]?.deletedAt || matches[0]?.anonymizedAt) throw new CrmError("A deleted or anonymized candidate matches this record. Review it before importing.");
  return matches[0] || null;
}

export async function saveCandidate(batch: typeof batches.$inferSelect, itemId: string, leaseId: string) {
  return db.transaction(async tx => {
    // Shared with the TalentSourcer importer so email-less LinkedIn matches cannot race.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`talentsourcer-import:${batch.workspaceId}`}, 0))`);
    const [connection] = await tx.select().from(connections).where(and(eq(connections.id, batch.connectionId), eq(connections.workspaceId, batch.workspaceId))).for("share");
    if (!connection?.token || connection.revision !== batch.connectionRevision) throw new CrmError("Connection changed. Create a new preview.");
    const [item] = await tx.select().from(items).where(and(eq(items.id, itemId), eq(items.batchId, batch.id), eq(items.leaseId, leaseId))).for("update");
    if (!item) return;
    if (item.candidateId) return;
    const profile = candidateSchema.parse(item.detail.profile);
    const values = candidateValues(profile);
    let candidate = await findMatch(tx, batch.workspaceId, batch.connectionId, item.externalSlug, values);
    await importAccess(batch.workspaceId, batch.actorId, batch.jobId, batch.stageId, candidate?.id);
    const flags = restrictions(profile);
    const alreadyExisted = Boolean(candidate);
    if (!candidate) {
      [candidate] = await tx.insert(candidates).values({ workspaceId: batch.workspaceId, ...values, ...flags, experienceEntries: workValues(item.detail.work || []), educationEntries: educationValues(item.detail.education || []) }).returning();
    } else {
      // Import never clears existing restrictions or replaces recruiter-edited facts.
      const existingIndefinite = candidate.contactOffLimits && !candidate.contactOffLimitsUntil;
      const untilMillis = Math.max(candidate.contactOffLimitsUntil?.getTime() || 0, flags.contactOffLimitsUntil?.getTime() || 0);
      const until = existingIndefinite || (flags.contactOffLimits && !flags.contactOffLimitsUntil) || !untilMillis ? null : new Date(untilMillis);
      await tx.update(candidates).set({ emailOptedOut: candidate.emailOptedOut || flags.emailOptedOut, contactOffLimits: candidate.contactOffLimits || flags.contactOffLimits, contactOffLimitsUntil: until, contactRestrictionReason: candidate.contactRestrictionReason || flags.contactRestrictionReason }).where(eq(candidates.id, candidate.id));
    }
    await tx.insert(links).values({ workspaceId: batch.workspaceId, connectionId: batch.connectionId, externalSlug: item.externalSlug, candidateId: candidate.id }).onConflictDoNothing();
    let applicationId: string | null = null;
    let existingDestination = false;
    if (batch.jobId && batch.stageId) {
      const [application] = await tx.select().from(applications).where(and(eq(applications.workspaceId, batch.workspaceId), eq(applications.jobId, batch.jobId), eq(applications.candidateId, candidate.id)));
      if (application) { applicationId = application.id; existingDestination = true; }
      else {
        await lockApplicationPipelineOrder(tx, batch.workspaceId, batch.stageId);
        const [order] = await tx.select({ value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1` }).from(applications).where(and(eq(applications.workspaceId, batch.workspaceId), eq(applications.currentStageId, batch.stageId)));
        const [created] = await tx.insert(applications).values({ workspaceId: batch.workspaceId, candidateId: candidate.id, jobId: batch.jobId, currentStageId: batch.stageId, pipelineOrder: order.value, source: "recruitcrm", status: "active" }).returning();
        applicationId = created.id;
        await tx.insert(applicationStageHistory).values({ workspaceId: batch.workspaceId, applicationId, toStageId: batch.stageId, movedById: batch.actorId });
      }
    } else {
      const [entry] = await tx.select().from(poolEntries).where(and(eq(poolEntries.workspaceId, batch.workspaceId), eq(poolEntries.candidateId, candidate.id), sql`${poolEntries.removedAt} is null`));
      existingDestination = Boolean(entry);
      if (!entry) await tx.insert(poolEntries).values({ workspaceId: batch.workspaceId, candidateId: candidate.id, source: "imported", addedById: batch.actorId, reason: "Imported from Recruit CRM" });
    }
    if (!existingDestination) {
      const custom = (profile.custom_fields || []).filter(field => field.value != null && field.value !== "").map(field => `${field.field_name || "Custom field"}: ${typeof field.value === "string" ? field.value : JSON.stringify(field.value)}`).join("\n");
      await tx.insert(candidateNotes).values({ workspaceId: batch.workspaceId, candidateId: candidate.id, authorId: batch.actorId, body: [`Imported from Recruit CRM (${connection.name})`, `Candidate slug: ${item.externalSlug}`, batch.source.jobSlug ? `Source job: ${batch.source.jobSlug}` : null, typeof item.snapshot.sourceStage === "string" ? `Source stage: ${item.snapshot.sourceStage}` : null, profile.source ? `Original source: ${profile.source}` : null, custom].filter(Boolean).join("\n\n"), workflowEffectId: `recruitcrm:${batch.id}:${item.id}` });
      await tx.insert(activityEvents).values({ workspaceId: batch.workspaceId, actorId: batch.actorId, entityType: applicationId ? "application" : "candidate", entityId: applicationId || candidate.id, type: "recruitcrm.imported", metadata: { source: "recruitcrm", connectionId: batch.connectionId, externalSlug: item.externalSlug, batchId: batch.id, destination: batch.jobId ? "job" : "pool", existingProfile: alreadyExisted, ...batch.source } });
    }
    if (batch.includeNotes) for (const note of z.array(noteSchema).parse(item.detail.notes || [])) {
      if (!note.description || (note.related_to !== item.externalSlug || note.related_to_type !== "candidate") && !note.associated_candidates?.includes(item.externalSlug)) continue;
      const authors = z.record(z.string(), z.string()).parse(item.detail.authors || {});
      const author = note.created_by && authors[note.created_by] ? `${authors[note.created_by]} (ID ${note.created_by})` : `author ID ${note.created_by || "unknown"}`;
      await tx.insert(candidateNotes).values({ workspaceId: batch.workspaceId, candidateId: candidate.id, authorId: batch.actorId, body: `Recruit CRM note · ${author} · ${note.created_on || "date unavailable"}\n\n${note.description}`, workflowEffectId: `recruitcrm-note:${batch.connectionId}:${note.id}` }).onConflictDoNothing();
    }
    await tx.update(items).set({ candidateId: candidate.id, applicationId, reason: existingDestination ? "Already at this destination. Profile and stage preserved." : alreadyExisted ? "Linked existing candidate; profile preserved." : null, step: batch.includeCv ? "cv" : "done", status: batch.includeCv ? "queued" : "imported" }).where(and(eq(items.id, item.id), eq(items.leaseId, leaseId)));
  });
}
