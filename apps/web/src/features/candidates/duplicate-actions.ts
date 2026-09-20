"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  candidates,
  candidateDuplicateDismissals,
  candidateMerges,
  db,
} from "@harly/db";
import {
  mergeCandidateRecords,
  mergeContext,
  previewCandidateMerge,
} from "./merge-service";
import { mergeFields } from "./merge-fields";
import { can } from "@/features/workspaces/permissions-server";
import { agencyApplicationId } from "@/features/clients/validation";

const id = agencyApplicationId;
export async function getDuplicateReview(primaryId: string, sourceId: string) {
  id.parse(primaryId);
  id.parse(sourceId);
  return {
    ...(await previewCandidateMerge(primaryId, sourceId)),
    canMerge:
      (await can("candidates:edit")) && (await can("candidates:delete")),
  };
}

export async function dismissCandidateDuplicate(
  primaryId: string,
  sourceId: string,
) {
  const context = await mergeContext(true);
  await previewCandidateMerge(id.parse(primaryId), id.parse(sourceId));
  const [candidateId, otherCandidateId] = [primaryId, sourceId].sort();
  await db
    .insert(candidateDuplicateDismissals)
    .values({
      workspaceId: context.organization.id,
      candidateId,
      otherCandidateId,
      actorId: context.user.id,
    })
    .onConflictDoNothing();
  revalidatePath("/dashboard/candidates", "layout");
}

const inputSchema = z.object({
  primaryId: id,
  sourceId: id,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  fields: z.partialRecord(z.enum(mergeFields), z.enum(["primary", "source"])),
  applicationChoices: z.record(id, id),
});

export async function mergeCandidatesAction(input: unknown) {
  try {
    const result = await mergeCandidateRecords(inputSchema.parse(input));
    revalidatePath("/dashboard", "layout");
    return { ok: true as const, ...result };
  } catch (error) {
    const safe =
      error instanceof Error &&
      [
        "Choose",
        "Both candidates",
        "These records",
        "Duplicate review",
        "A candidate",
        "You do not",
      ].some((prefix) => error.message.startsWith(prefix));
    return {
      ok: false as const,
      error: safe
        ? (error as Error).message
        : "Could not merge the records. No changes were saved. Refresh and try again.",
    };
  }
}

export async function getCandidateMergeHistory(candidateId: string) {
  const context = await mergeContext();
  const [person] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, context.organization.id),
        eq(candidates.id, id.parse(candidateId)),
      ),
    );
  if (!person) throw new Error("Candidate not found.");
  const audits = await db
    .select()
    .from(candidateMerges)
    .where(
      and(
        eq(candidateMerges.workspaceId, context.organization.id),
        eq(candidateMerges.candidateId, candidateId),
      ),
    );
  return audits.map((audit) => ({
    id: audit.id,
    sourceId: audit.sourceId,
    createdAt: audit.createdAt.toISOString(),
    snapshot: (() => {
      const original = audit.snapshot as Record<string, unknown>;
      const related = original.related as Record<string, unknown> | undefined;
      return {
        primary: original.primary,
        source: original.source,
        applications: original.applications,
        applicationChoices: original.applicationChoices,
        fields: original.fields,
        answers: related?.application_answers,
      };
    })(),
  }));
}
