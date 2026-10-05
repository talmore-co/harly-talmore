import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@harly/db";
import { jobStages } from "@harly/db";
import { statusForStageName } from "@/features/pipeline/state";
import { getWorkspaceContext } from "@/features/workspaces/context";

export type MoveStageOption = { id: string; name: string };

/**
 * Stages a recruiter may move an application to from the profile, in pipeline
 * order. Terminal stages (Hired, Rejected) are left out on purpose: moving
 * there is a hire or a rejection, and those have their own confirmed actions.
 */
export async function listMoveStageOptions(
  jobId: string,
): Promise<MoveStageOption[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const stages = await db
    .select({ id: jobStages.id, name: jobStages.name })
    .from(jobStages)
    .where(
      and(eq(jobStages.workspaceId, workspace.id), eq(jobStages.jobId, jobId)),
    )
    .orderBy(asc(jobStages.order));

  return stages.filter((stage) => statusForStageName(stage.name) === "active");
}
