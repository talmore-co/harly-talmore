"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@harly/api";
import { db, jobs, candidateReferrals } from "@harly/db";
import {
  requireCandidatePermission,
  requireJobPermission,
} from "@/features/workspaces/permissions-server";
import { createApplicationForApi } from "@/features/applications/service";

export async function addCandidateToPipeline(input: {
  candidateId: string;
  jobId: string;
}) {
  const parsed = z
    .object({ candidateId: z.string().uuid(), jobId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Choose a candidate and job." };
  try {
    const context = await requireCandidatePermission(
      "candidates:edit",
      parsed.data.candidateId,
    );
    await requireJobPermission("candidates:edit", parsed.data.jobId);
    const workspaceId = context.organization.id;
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, parsed.data.jobId),
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.status, "open"),
          isNull(jobs.deletedAt),
        ),
      )
      .limit(1);
    if (!job) return { success: false, error: "Choose an open job." };
    const [referral] = await db
      .select({ id: candidateReferrals.id })
      .from(candidateReferrals)
      .where(
        and(
          eq(candidateReferrals.workspaceId, workspaceId),
          eq(candidateReferrals.candidateId, parsed.data.candidateId),
          eq(candidateReferrals.jobId, parsed.data.jobId),
        ),
      )
      .limit(1);
    await createApplicationForApi({
      workspaceId,
      ...parsed.data,
      source: referral ? "referral" : "manual",
    });
    revalidatePath(`/dashboard/candidates/${parsed.data.candidateId}`);
    revalidatePath("/dashboard/candidates");
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    if (
      error instanceof ApiError && error.code === "conflict"
    ) {
      return {
        success: false,
        error: "Candidate already has an application for this job.",
      };
    }
    return {
      success: false,
      error:
        "Could not add candidate. Check your access and that the job has pipeline stages.",
    };
  }
}
