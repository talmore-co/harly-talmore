"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db, jobs } from "@harly/db";
import { revalidatePath } from "next/cache";
import { requireJobPermission } from "@/features/workspaces/permissions-server";
import { validDashboardDay } from "@/features/dashboard/day";

export async function saveRoleTakenOn(jobId: string, takenOn: string | null) {
  if (
    takenOn !== null &&
    (!validDashboardDay(takenOn) ||
      takenOn > new Date().toISOString().slice(0, 10))
  ) {
    return {
      success: false as const,
      error: "Enter a valid approval date, today or earlier.",
    };
  }
  try {
    const { organization } = await requireJobPermission("jobs:edit", jobId);
    const [row] = await db
      .update(jobs)
      .set({ takenOn, updatedAt: new Date() })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.workspaceId, organization.id),
          isNull(jobs.deletedAt),
        ),
      )
      .returning({ id: jobs.id });
    if (!row) throw new Error("Job unavailable");
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath("/dashboard/reports");
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error: "Could not save the approval date. Check your job access.",
    };
  }
}
