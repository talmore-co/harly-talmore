"use server";

import { and, eq, isNull } from "drizzle-orm";
import { applications, db, jobs } from "@harly/db";
import { revalidatePath } from "next/cache";
import {
  requireApplicationPermission,
  requireJobPermission,
} from "@/features/workspaces/permissions-server";
import { definitionSchema, definitionToken } from "./scorecard-definition";

export async function saveJobScorecard(
  jobId: string,
  value: unknown,
  originalToken: string,
) {
  const parsed = definitionSchema.safeParse(value);
  if (!parsed.success)
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid scorecard.",
    };
  try {
    const context = await requireJobPermission("jobs:edit", jobId);
    await db.transaction(async (tx) => {
      const [job] = await tx
        .select({ definition: jobs.scorecardDefinition })
        .from(jobs)
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.workspaceId, context.organization.id),
            isNull(jobs.deletedAt),
          ),
        )
        .for("update");
      if (!job) throw new Error("Job unavailable.");
      if (
        definitionToken(definitionSchema.parse(job.definition)) !==
        originalToken
      )
        throw new Error(
          "This scorecard was changed by someone else. Reload before editing.",
        );
      await tx
        .update(jobs)
        .set({ scorecardDefinition: parsed.data, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
    });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error:
        "Could not save. Check your access, or reload if the scorecard was changed by someone else.",
    };
  }
}

export async function getApplicationScorecard(
  applicationId: string,
  candidateId: string,
) {
  try {
    const context = await requireApplicationPermission(
      "collab:write",
      applicationId,
    );
    const [row] = await db
      .select({ definition: jobs.scorecardDefinition })
      .from(applications)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, context.organization.id),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.workspaceId, context.organization.id),
          eq(applications.candidateId, candidateId),
        ),
      );
    if (!row) throw new Error("Application unavailable.");
    const dimensions = definitionSchema.parse(row.definition);
    return {
      success: true as const,
      dimensions,
      definitionToken: definitionToken(dimensions),
    };
  } catch {
    return {
      success: false as const,
      error:
        "Could not load this application's scorecard. Check your access and try again.",
    };
  }
}
