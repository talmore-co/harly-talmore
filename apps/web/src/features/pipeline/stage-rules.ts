import { statusForStageName } from "@/features/pipeline/state";

/**
 * Rules for editing a job's pipeline stages.
 *
 * Three stage names carry behaviour across the product: an application's
 * status, offers, placements, reports and imports all recognise "Hired",
 * "Rejected" and "Rejected by client" by name. Those stages are therefore
 * protected here: they cannot be renamed or deleted, and no other stage can be
 * renamed into one of them. Everything else is a working stage.
 */
export const STAGE_NAME_MAX_LENGTH = 60;

const OUTCOME_STAGE_NAMES = ["Hired", "Rejected", "Rejected by client"] as const;

type StageRef = { id: string; name: string };
export type StageRuleResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const pass = <T>(value: T) => ({ ok: true as const, value });
const key = (name: string) => name.trim().toLowerCase();

/** Canonical spelling when `name` is an outcome stage, otherwise null. */
export function outcomeStageName(name: string): string | null {
  return OUTCOME_STAGE_NAMES.find((outcome) => key(outcome) === key(name)) ?? null;
}

export function isOutcomeStage(name: string): boolean {
  return statusForStageName(name) !== "active";
}

function cleanName(name: unknown): StageRuleResult<string> {
  if (typeof name !== "string") return fail("Enter a stage name.");
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return fail("Enter a stage name.");
  if (cleaned.length > STAGE_NAME_MAX_LENGTH) {
    return fail(`Stage names can be up to ${STAGE_NAME_MAX_LENGTH} characters.`);
  }
  return pass(cleaned);
}

function nameTaken(name: string, stages: StageRef[], exceptId?: string) {
  return stages.some(
    (stage) => stage.id !== exceptId && key(stage.name) === key(name),
  );
}

/**
 * A new stage may be an outcome stage the job is missing (it is stored with its
 * canonical spelling so name lookups keep matching); duplicates are rejected
 * case-insensitively, stricter than the database's exact-match index.
 */
export function validateNewStageName(
  name: unknown,
  stages: StageRef[],
): StageRuleResult<string> {
  const cleaned = cleanName(name);
  if (!cleaned.ok) return cleaned;
  const value = outcomeStageName(cleaned.value) ?? cleaned.value;
  if (nameTaken(value, stages)) {
    return fail(`This job already has a "${value}" stage.`);
  }
  if (
    isOutcomeStage(value) &&
    !stages.some((stage) => !isOutcomeStage(stage.name))
  ) {
    return fail(
      `Add a stage for incoming applications before adding "${value}".`,
    );
  }
  return pass(value);
}

export function validateStageRename(
  stage: StageRef,
  name: unknown,
  stages: StageRef[],
): StageRuleResult<string> {
  const cleaned = cleanName(name);
  if (!cleaned.ok) return cleaned;
  if (cleaned.value === stage.name) return cleaned;
  if (isOutcomeStage(stage.name)) {
    return fail(
      `"${stage.name}" records the outcome of an application and cannot be renamed.`,
    );
  }
  if (isOutcomeStage(cleaned.value)) {
    return fail(
      `"${outcomeStageName(cleaned.value)}" is reserved for the outcome stage. Choose another name.`,
    );
  }
  if (nameTaken(cleaned.value, stages, stage.id)) {
    return fail(`This job already has a "${cleaned.value}" stage.`);
  }
  return cleaned;
}

/**
 * The new order must contain exactly the job's stages. New applications enter
 * the first stage, so an outcome stage can never lead the pipeline.
 */
export function validateStageOrder(
  stages: StageRef[],
  orderedIds: unknown,
): StageRuleResult<string[]> {
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.some((id) => typeof id !== "string")
  ) {
    return fail("Invalid stage order.");
  }
  const ids = orderedIds as string[];
  const known = new Map(stages.map((stage) => [stage.id, stage]));
  if (
    ids.length !== stages.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !known.has(id))
  ) {
    return fail("The stages changed. Refresh and try again.");
  }
  const first = known.get(ids[0] ?? "");
  if (first && isOutcomeStage(first.name)) {
    return fail(
      `New applications enter the first stage, so "${first.name}" cannot come first.`,
    );
  }
  return pass(ids);
}

/**
 * A stage can only be deleted when no candidate is or ever was in it: current
 * applications would lose their stage, and stage history (time in stage,
 * reports, the candidate timeline) points at the stage row.
 */
export function validateStageDelete(
  stage: StageRef,
  stages: StageRef[],
  usage: { applications: number; history: number },
): StageRuleResult<null> {
  if (isOutcomeStage(stage.name)) {
    return fail(
      `"${stage.name}" records the outcome of an application and cannot be deleted.`,
    );
  }
  if (usage.applications > 0) {
    const noun = usage.applications === 1 ? "candidate" : "candidates";
    return fail(
      `Move the ${usage.applications} ${noun} in "${stage.name}" to another stage first.`,
    );
  }
  if (usage.history > 0) {
    return fail(
      `Candidates have passed through "${stage.name}", so it is part of their history and cannot be deleted. Rename it instead.`,
    );
  }
  const otherWorkingStages = stages.filter(
    (other) => other.id !== stage.id && !isOutcomeStage(other.name),
  );
  if (otherWorkingStages.length === 0) {
    return fail("A pipeline needs at least one stage before the outcome stages.");
  }
  return pass(null);
}

/**
 * Where a new stage goes: after the last working stage, before the trailing
 * outcome stages, so "Hired" and "Rejected" stay at the end of the board.
 * An outcome stage itself is appended.
 */
export function newStageIndex(
  orderedStages: StageRef[],
  newStageName: string,
): number {
  if (isOutcomeStage(newStageName)) return orderedStages.length;
  let index = orderedStages.length;
  while (index > 0 && isOutcomeStage(orderedStages[index - 1].name)) index -= 1;
  return index;
}
