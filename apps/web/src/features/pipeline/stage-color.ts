// Keep a stage's color consistent across overview charts, regardless of order.
const STAGE_COLORS: Record<string, string> = {
  applied: "#8a8f98",
  screening: "#5b8def",
  interview: "#e8a33d",
  submitted: "#a875e0",
  offer: "#32a89b",
  hired: "#c8f560",
  rejected: "#d46b5e",
  "rejected by client": "#b44f78",
};

export function pipelineStageColor(stage: { name: string; color: string | null }) {
  return STAGE_COLORS[stage.name.trim().toLowerCase()] ?? stage.color ?? "#8a8f98";
}
