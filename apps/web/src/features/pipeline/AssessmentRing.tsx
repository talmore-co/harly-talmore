"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssessmentCounts } from "@/features/candidates/assessment-counts";

const ratings = [
  { key: "strong", label: "Strong", color: "text-emerald-600 dark:text-emerald-400" },
  { key: "mixed", label: "Mixed", color: "text-amber-500 dark:text-amber-400" },
  { key: "weak", label: "Weak", color: "text-rose-600 dark:text-rose-400" },
] as const;

export function AssessmentRing({ counts = { strong: 0, mixed: 0, weak: 0 } }: { counts?: AssessmentCounts }) {
  const total = counts.strong + counts.mixed + counts.weak;
  const summary = total ? `${total} team assessments: ${counts.strong} Strong, ${counts.mixed} Mixed, ${counts.weak} Weak` : "No team assessments yet";
  return <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" aria-label={summary} title={summary} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="flex shrink-0 flex-col items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="relative flex size-12 items-center justify-center text-sm tabular-nums">
          <svg viewBox="0 0 48 48" className="absolute inset-0 size-12 -rotate-90" aria-hidden="true">
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted" />
            {ratings.map(({ key, color }) => {
              const length = total ? counts[key] / total * 100 : 0;
              const preceding = key === "strong" ? 0 : key === "mixed" ? counts.strong : counts.strong + counts.mixed;
              const start = total ? preceding / total * 100 : 0;
              return length ? <circle key={key} cx="24" cy="24" r="21" pathLength="100" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} className={color} /> : null;
            })}
          </svg>
          <span className={total ? "font-medium" : "text-muted-foreground"}>{total || "—"}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">Team</span>
      </button>
    </TooltipTrigger>
    <TooltipContent><p className="font-medium">Team assessments · {total}</p>{total ? ratings.map(({ key, label }) => <p key={key}>{label}: {counts[key]}</p>) : <p>No assessments yet</p>}</TooltipContent>
  </Tooltip>;
}
