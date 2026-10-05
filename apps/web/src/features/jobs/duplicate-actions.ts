"use server";

import { revalidatePath } from "next/cache";

import { requireJobPermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";

import { duplicateJob } from "./duplicate-service";

export type DuplicateJobResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

/**
 * Create a draft copy of a job. Needs the same permission as creating a job;
 * the job-scoped check also keeps scoped roles from copying a job they cannot
 * open.
 */
export async function duplicateJobAction(
  jobId: string,
): Promise<DuplicateJobResult> {
  const context = await requireJobPermission("jobs:create", jobId);
  const copy = await duplicateJob(jobId);

  if (!copy) {
    return { success: false, error: "Job not found." };
  }

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "job.created",
    resourceType: "job",
    resourceId: copy.id,
    severity: "info",
    metadata: { title: copy.title, slug: copy.slug, duplicatedFromJobId: jobId },
  });

  revalidatePath("/dashboard/jobs");
  return { success: true, jobId: copy.id };
}
