export type PipelineApplicationStatus =
  | "active"
  | "hired"
  | "rejected"
  | "withdrawn";

/**
 * Pipeline stages are the source of truth for active/terminal placement.
 * Custom stages remain active; the default terminal stages are recognized
 * case-insensitively so state changes are consistent across all entry points.
 */
export function statusForStageName(
  stageName: string,
): PipelineApplicationStatus {
  const normalized = stageName.trim().toLowerCase();
  if (normalized === "hired") return "hired";
  if (normalized === "rejected" || normalized === "rejected by client") return "rejected";
  return "active";
}

export function terminalStageNameForStatus(
  status: PipelineApplicationStatus,
  rejectionSource: "agency" | "client" = "agency",
) {
  if (status === "hired") return "Hired";
  if (status === "rejected") return rejectionSource === "client" ? "Rejected by client" : "Rejected";
  return null;
}

export function rejectionSourceForStageName(name: string): "agency" | "client" | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "rejected by client") return "client";
  if (normalized === "rejected") return "agency";
  return null;
}

/**
 * Status an application carries after a pipeline move.
 *
 * - Reordering inside the same stage never changes status.
 * - Entering a terminal stage (Hired / Rejected / Rejected by client) sets the
 *   matching status.
 * - Leaving the terminal stage that explains the current status reactivates
 *   the application, e.g. dragging a rejected card out of Rejected.
 * - A withdrawn (or otherwise non-active) application moved between two working
 *   stages keeps its status. Reactivating is an explicit decision made through
 *   the status action, never a side effect of a drag.
 */
export function statusAfterStageMove(input: {
  currentStatus: PipelineApplicationStatus;
  /** Null when the previous stage is unknown; treated as a working stage. */
  fromStageName: string | null;
  toStageName: string;
  sameStage: boolean;
}): PipelineApplicationStatus {
  if (input.sameStage) return input.currentStatus;

  const targetStatus = statusForStageName(input.toStageName);
  if (targetStatus !== "active") return targetStatus;
  if (input.currentStatus === "active") return "active";

  const fromStatus = input.fromStageName
    ? statusForStageName(input.fromStageName)
    : "active";
  return fromStatus === input.currentStatus ? "active" : input.currentStatus;
}
