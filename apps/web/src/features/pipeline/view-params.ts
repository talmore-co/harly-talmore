import type { ScoreSort } from "./PipelineScores";

/**
 * Pipeline view state that lives in the URL, shared by the list and the board
 * so a reload, a shared link or a List/Board switch keeps the same filters.
 */
export const PIPELINE_VIEW_PARAMS = {
  query: "q",
  status: "status",
  sort: "sort",
  minimumQuestionnaire: "minScore",
  minimumAi: "minAi",
  attribution: "attribution",
  hideEmpty: "hideEmpty",
} as const;

type ViewParamKey = keyof typeof PIPELINE_VIEW_PARAMS;
type ParamReader = { get(name: string): string | null };

const SCORE_SORTS: ScoreSort[] = [
  "manual",
  "newest",
  "oldest",
  "questionnaireScore",
  "aiScore",
];
const STATUS_FILTERS = ["active", "hired", "rejected", "withdrawn"] as const;
export type PipelineStatusFilter = "all" | (typeof STATUS_FILTERS)[number];

export function readScoreSort(
  params: ParamReader,
  fallback: ScoreSort,
  allowManual = true,
): ScoreSort {
  const value = params.get(PIPELINE_VIEW_PARAMS.sort) as ScoreSort | null;
  if (!value || !SCORE_SORTS.includes(value)) return fallback;
  if (value === "manual" && !allowManual) return fallback;
  return value;
}

/** Minimum-score inputs hold "" (any score) or a whole number from 0 to 100. */
export function readScoreThreshold(
  params: ParamReader,
  key: "minimumQuestionnaire" | "minimumAi",
): string {
  const value = params.get(PIPELINE_VIEW_PARAMS[key])?.trim() ?? "";
  if (!/^\d{1,3}$/.test(value)) return "";
  return Number(value) <= 100 ? String(Number(value)) : "";
}

export function readStatusFilter(params: ParamReader): PipelineStatusFilter {
  const value = params.get(PIPELINE_VIEW_PARAMS.status);
  return STATUS_FILTERS.find((status) => status === value) ?? "all";
}

export function readText(
  params: ParamReader,
  key: "query" | "attribution",
): string {
  return params.get(PIPELINE_VIEW_PARAMS[key]) ?? "";
}

/**
 * Applies view state onto the current query string. Empty values and `null`
 * (the view's default) are removed so default views keep a clean URL, and
 * unrelated params (job, view, stage, client) are left alone.
 */
export function applyPipelineViewParams(
  current: string,
  values: Partial<Record<ViewParamKey, string | null>>,
): string {
  const next = new URLSearchParams(current);

  for (const [key, value] of Object.entries(values) as [
    ViewParamKey,
    string | null,
  ][]) {
    const name = PIPELINE_VIEW_PARAMS[key];
    if (value === null || value.trim() === "") next.delete(name);
    else next.set(name, value);
  }

  return next.toString();
}
