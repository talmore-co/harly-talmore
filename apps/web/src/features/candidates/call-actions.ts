"use server";

import { and, desc, eq } from "drizzle-orm";
import { activityEvents, applications, db, user } from "@harly/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  requireApplicationPermission,
  requireCandidatePermission,
} from "@/features/workspaces/permissions-server";

const callSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  applicationId: z.string().uuid().nullable(),
  occurredAt: z
    .string()
    .datetime()
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + 60000,
      "Call time cannot be in the future.",
    ),
  direction: z.enum(["outbound", "inbound"]),
  purpose: z.enum(["scheduling", "follow_up", "other"]),
  outcome: z.enum([
    "connected",
    "no_answer",
    "voicemail",
    "busy",
    "wrong_number",
  ]),
  notes: z
    .string()
    .trim()
    .min(1, "Add a short note about the call.")
    .max(10000),
});

export async function logCandidateCall(input: z.input<typeof callSchema>) {
  try {
    const parsed = callSchema.parse(input);
    const context = await requireCandidatePermission(
      "collab:write",
      parsed.candidateId,
    );
    if (parsed.applicationId) {
      await requireApplicationPermission("collab:write", parsed.applicationId);
      const [app] = await db
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.id, parsed.applicationId),
            eq(applications.workspaceId, context.organization.id),
            eq(applications.candidateId, parsed.candidateId),
          ),
        );
      if (!app)
        throw new Error(
          "The selected application does not belong to this candidate.",
        );
    }
    const { id, candidateId, ...metadata } = parsed;
    await db
      .insert(activityEvents)
      .values({
        id,
        workspaceId: context.organization.id,
        actorId: context.user.id,
        entityType: "candidate",
        entityId: candidateId,
        type: "candidate.call_logged",
        metadata,
      })
      .onConflictDoNothing({ target: activityEvents.id });
    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not log the call.",
    };
  }
}

export async function listCandidateCalls(candidateId: string) {
  const { organization } = await requireCandidatePermission(
    "candidates:view",
    candidateId,
  );
  const rows = await db
    .select({
      id: activityEvents.id,
      metadata: activityEvents.metadata,
      authorName: user.name,
    })
    .from(activityEvents)
    .leftJoin(user, eq(user.id, activityEvents.actorId))
    .where(
      and(
        eq(activityEvents.workspaceId, organization.id),
        eq(activityEvents.entityType, "candidate"),
        eq(activityEvents.entityId, candidateId),
        eq(activityEvents.type, "candidate.call_logged"),
      ),
    )
    .orderBy(desc(activityEvents.createdAt));
  const result = [];
  for (const row of rows) {
    const parsed = callSchema.safeParse({
      ...(row.metadata as object),
      id: row.id,
      candidateId,
    });
    if (!parsed.success) continue;
    if (parsed.data.applicationId) {
      try {
        await requireApplicationPermission(
          "candidates:view",
          parsed.data.applicationId,
        );
      } catch {
        continue;
      }
    }
    result.push({ ...parsed.data, authorName: row.authorName });
  }
  return result.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
