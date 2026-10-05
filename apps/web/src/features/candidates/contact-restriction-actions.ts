"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { activityEvents, candidates, db } from "@harly/db";
import { requireCandidatePermission } from "@/features/workspaces/permissions-server";

const restrictionsSchema = z.object({
  candidateId: z.string().min(1),
  emailOptedOut: z.boolean(),
  offLimits: z.boolean(),
  offLimitsUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  reason: z.string().trim().max(500),
});

/** Set or lift a candidate's email opt-out and off-limits flags. */
export async function updateCandidateContactRestrictions(
  input: z.input<typeof restrictionsSchema>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = restrictionsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid contact restrictions." };
  }
  const data = parsed.data;
  const context = await requireCandidatePermission("candidates:edit", data.candidateId);
  const workspaceId = context.organization.id;
  // A dated restriction lasts through the end of the chosen day.
  const until = data.offLimits && data.offLimitsUntil ? new Date(`${data.offLimitsUntil}T23:59:59.999Z`) : null;
  const restricted = data.emailOptedOut || data.offLimits;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(candidates)
      .set({
        emailOptedOut: data.emailOptedOut,
        contactOffLimits: data.offLimits,
        contactOffLimitsUntil: until,
        contactRestrictionReason: restricted ? data.reason || null : null,
        updatedAt: new Date(),
      })
      .where(and(eq(candidates.id, data.candidateId), eq(candidates.workspaceId, workspaceId)))
      .returning({ id: candidates.id });
    if (!row) return false;
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: context.user.id,
      entityType: "candidate",
      entityId: data.candidateId,
      type: "candidate.contact_restrictions_updated",
      metadata: { emailOptedOut: data.emailOptedOut, offLimits: data.offLimits, offLimitsUntil: data.offLimits ? data.offLimitsUntil : null },
    });
    return true;
  });
  if (!updated) return { success: false, error: "Candidate not found." };

  revalidatePath(`/dashboard/candidates/${data.candidateId}`);
  return { success: true };
}
