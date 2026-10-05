"use server";

import { revalidatePath } from "next/cache";
import { and, asc, count, eq, or } from "drizzle-orm";
import { z } from "zod";

import {
  applications,
  applicationStageHistory,
  db,
  jobStages,
} from "@harly/db";
import {
  listJobStagesForApi,
  updateJobStageForApi,
} from "@/features/pipeline/service";
import {
  newStageIndex,
  validateNewStageName,
  validateStageDelete,
  validateStageOrder,
  validateStageRename,
} from "@/features/pipeline/stage-rules";
import { requireJobPermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("pipeline-stages");

/** Editing a job's stages is part of editing the job. */
const STAGE_PERMISSION = "jobs:edit";
const MAX_STAGES = 30;

type StageActionResult = { success: boolean; error?: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type StageRow = { id: string; name: string; order: number };

/** Validation failures are safe to show; everything else stays generic. */
class StageRuleError extends Error {}

const jobInput = z.object({ jobId: z.uuid() });
const stageInput = jobInput.extend({ stageId: z.uuid() });

function failure(error: unknown, fallback: string): StageActionResult {
  if (error instanceof StageRuleError) {
    return { success: false, error: error.message };
  }
  log.error(error, fallback);
  return { success: false, error: fallback };
}

/** Row-locks the job's stages so concurrent edits cannot interleave orders. */
async function lockStages(
  tx: Transaction,
  workspaceId: string,
  jobId: string,
): Promise<StageRow[]> {
  return tx
    .select({ id: jobStages.id, name: jobStages.name, order: jobStages.order })
    .from(jobStages)
    .where(
      and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.jobId, jobId)),
    )
    .orderBy(asc(jobStages.order))
    .for("update");
}

/**
 * Rewrites `order` to 1..n in the given sequence. `(job_id, order)` is unique
 * and checked per row, so stages first move to negative placeholders that no
 * existing row can hold, then to their final positions.
 */
async function writeStageOrder(
  tx: Transaction,
  workspaceId: string,
  jobId: string,
  orderedIds: string[],
  current: StageRow[],
) {
  const currentOrder = new Map(current.map((stage) => [stage.id, stage.order]));
  if (orderedIds.every((id, index) => currentOrder.get(id) === index + 1)) {
    return;
  }

  const placeholderBase = Math.max(
    0,
    ...current.map((stage) => Math.abs(stage.order)),
  );
  const scope = (stageId: string) =>
    and(
      eq(jobStages.id, stageId),
      eq(jobStages.workspaceId, workspaceId),
      eq(jobStages.jobId, jobId),
    );

  for (const [index, stageId] of orderedIds.entries()) {
    await tx
      .update(jobStages)
      .set({ order: -(placeholderBase + index + 1) })
      .where(scope(stageId));
  }
  for (const [index, stageId] of orderedIds.entries()) {
    await tx
      .update(jobStages)
      .set({ order: index + 1 })
      .where(scope(stageId));
  }
}

export async function createJobStage(input: {
  jobId: string;
  name: string;
}): Promise<StageActionResult> {
  try {
    const parsed = jobInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid stage request." };
    const { jobId } = parsed.data;
    const { organization: workspace } = await requireJobPermission(
      STAGE_PERMISSION,
      jobId,
    );

    await db.transaction(async (tx) => {
      const stages = await lockStages(tx, workspace.id, jobId);
      if (stages.length >= MAX_STAGES) {
        throw new StageRuleError(`A pipeline can have up to ${MAX_STAGES} stages.`);
      }
      const name = validateNewStageName(input?.name, stages);
      if (!name.ok) throw new StageRuleError(name.error);

      // Insert past every existing order, then slot it in before the outcome
      // stages with the same contiguous rewrite a reorder uses.
      const insertOrder =
        Math.max(0, ...stages.map((stage) => stage.order)) + 1;
      const [created] = await tx
        .insert(jobStages)
        .values({
          workspaceId: workspace.id,
          jobId,
          name: name.value,
          order: insertOrder,
        })
        .returning({ id: jobStages.id });

      const orderedIds = stages.map((stage) => stage.id);
      orderedIds.splice(newStageIndex(stages, name.value), 0, created.id);
      await writeStageOrder(tx, workspace.id, jobId, orderedIds, [
        ...stages,
        { id: created.id, name: name.value, order: insertOrder },
      ]);
    });

    revalidatePath("/dashboard/pipeline");
    return { success: true };
  } catch (error) {
    return failure(error, "Unable to add the stage.");
  }
}

export async function renameJobStage(input: {
  jobId: string;
  stageId: string;
  name: string;
}): Promise<StageActionResult> {
  try {
    const parsed = stageInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid stage request." };
    const { jobId, stageId } = parsed.data;
    const { organization: workspace } = await requireJobPermission(
      STAGE_PERMISSION,
      jobId,
    );

    const stages = await listJobStagesForApi({ workspaceId: workspace.id, jobId });
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) return { success: false, error: "Stage not found." };

    const name = validateStageRename(stage, input?.name, stages);
    if (!name.ok) return { success: false, error: name.error };
    if (name.value !== stage.name) {
      await updateJobStageForApi({
        workspaceId: workspace.id,
        jobId,
        stageId,
        patch: { name: name.value },
      });
    }

    revalidatePath("/dashboard/pipeline");
    return { success: true };
  } catch (error) {
    return failure(error, "Unable to rename the stage.");
  }
}

export async function reorderJobStages(input: {
  jobId: string;
  orderedStageIds: string[];
}): Promise<StageActionResult> {
  try {
    const parsed = jobInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid stage request." };
    const { jobId } = parsed.data;
    const { organization: workspace } = await requireJobPermission(
      STAGE_PERMISSION,
      jobId,
    );

    await db.transaction(async (tx) => {
      const stages = await lockStages(tx, workspace.id, jobId);
      const order = validateStageOrder(stages, input?.orderedStageIds);
      if (!order.ok) throw new StageRuleError(order.error);
      await writeStageOrder(tx, workspace.id, jobId, order.value, stages);
    });

    revalidatePath("/dashboard/pipeline");
    return { success: true };
  } catch (error) {
    return failure(error, "Unable to reorder the stages.");
  }
}

export async function deleteJobStage(input: {
  jobId: string;
  stageId: string;
}): Promise<StageActionResult> {
  try {
    const parsed = stageInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid stage request." };
    const { jobId, stageId } = parsed.data;
    const { organization: workspace } = await requireJobPermission(
      STAGE_PERMISSION,
      jobId,
    );

    await db.transaction(async (tx) => {
      const stages = await lockStages(tx, workspace.id, jobId);
      const stage = stages.find((item) => item.id === stageId);
      if (!stage) throw new StageRuleError("Stage not found.");

      const [inStage] = await tx
        .select({ value: count() })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, workspace.id),
            eq(applications.currentStageId, stageId),
          ),
        );
      const [inHistory] = await tx
        .select({ value: count() })
        .from(applicationStageHistory)
        .where(
          and(
            eq(applicationStageHistory.workspaceId, workspace.id),
            or(
              eq(applicationStageHistory.toStageId, stageId),
              eq(applicationStageHistory.fromStageId, stageId),
            ),
          ),
        );
      const allowed = validateStageDelete(stage, stages, {
        applications: inStage?.value ?? 0,
        history: inHistory?.value ?? 0,
      });
      if (!allowed.ok) throw new StageRuleError(allowed.error);

      await tx
        .delete(jobStages)
        .where(
          and(
            eq(jobStages.id, stageId),
            eq(jobStages.workspaceId, workspace.id),
            eq(jobStages.jobId, jobId),
          ),
        );
      const remaining = stages.filter((item) => item.id !== stageId);
      await writeStageOrder(
        tx,
        workspace.id,
        jobId,
        remaining.map((item) => item.id),
        remaining,
      );
    });

    revalidatePath("/dashboard/pipeline");
    return { success: true };
  } catch (error) {
    return failure(error, "Unable to delete the stage.");
  }
}
