"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CandidateCard } from "@/features/pipeline/CandidateCard";
import type {
  PipelineApplication,
  PipelineStage,
} from "@/features/pipeline/data";
import { cn } from "@/lib/utils";

type StageColumnProps = {
  stage: PipelineStage;
  applications: PipelineApplication[];
  selectedIds: Set<string>;
  disabled?: boolean;
  dragDisabled?: boolean;
  /** Column position, so the header dot can show funnel progression. */
  index: number;
  total: number;
  onSelect: (applicationId: string, selected: boolean) => void;
};

/**
 * Funnel progression, ink lightening as the column narrows , the same ramp the
 * dashboard's pipeline overview uses, so a stage looks like the same stage in
 * both places. Stages carry no per-stage brand hue: a colour per column was five
 * competing accents across a screen that is meant to be one calm surface.
 */
function stageDotColor(index: number, total: number) {
  if (total <= 1) return "#171717";
  const ramp = ["#171717", "#3d3d3a", "#6a6a67", "#9a9a96", "#c8f560"];
  const position = Math.round((index / (total - 1)) * (ramp.length - 1));
  return ramp[Math.min(position, ramp.length - 1)];
}

export function StageColumn({
  stage,
  applications,
  selectedIds,
  disabled = false,
  dragDisabled = false,
  index,
  total,
  onSelect,
}: StageColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: disabled || dragDisabled,
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        // The column is a region of paper, not a bordered grey box. Depth is
        // luminance: paper column on the snow stage, and the drop target lights
        // up with the sage wash rather than a coloured border.
        "flex min-w-0 flex-col rounded-[var(--radius-lg)] bg-warm-paper transition-colors duration-150",
        isOver && "bg-sage-wash",
      )}
    >
      <div className="sticky top-0 z-10 rounded-t-[var(--radius-lg)] bg-warm-paper/95 px-3 pb-2 pt-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: stageDotColor(index, total) }}
              aria-hidden
            />
            <h2 className="truncate text-[13px] font-medium text-near-ink">
              {stage.name}
            </h2>
            <span className="font-chrome tabular text-[12px] text-quiet-mist">
              {applications.length}
            </span>
          </div>

        </div>
      </div>

      <SortableContext
        items={applications.map((application) => application.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex max-h-[calc(100vh-15rem)] flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          {applications.map((application) => (
            <CandidateCard
              key={application.id}
              application={application}
              selected={selectedIds.has(application.id)}
              disabled={disabled}
              dragDisabled={dragDisabled}
              onSelect={onSelect}
            />
          ))}
          {applications.length === 0 ? (
            /*
             * An empty column is the normal state of a healthy funnel, so it
             * says almost nothing. The old dashed "Drop candidates here" box in
             * every empty column shouted five times about an absence.
             */
            <div
              className={cn(
                "flex min-h-16 items-center justify-center rounded-[var(--radius-md)] text-center transition-colors",
                isOver
                  ? "text-sage-ink"
                  : "text-quiet-mist/70",
              )}
            >
              <span className="font-chrome text-[11px]">
                {isOver ? "Drop to move here" : "Empty"}
              </span>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}
