import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

import type { Scorecard } from "./types";
import { criterionValue, type SavedCriterion } from "../scorecard-definition";
import type { CandidateInterviewItem } from "@/features/interviews/shared";
import { interviewTypeLabel } from "@/features/interviews/shared";

const RATING_META = {
  strong: {
    label: "Strong",
    icon: ThumbsUp,
    className: "text-primary",
    accent: "bg-lime",
  },
  mixed: {
    label: "Mixed",
    icon: Minus,
    className: "text-clay",
    accent: "bg-clay",
  },
  weak: {
    label: "Weak",
    icon: ThumbsDown,
    className: "text-destructive",
    accent: "bg-destructive",
  },
} as const;

export function ScorecardList({ scorecards, application, interviews = [] }: {
  scorecards: Scorecard[];
  application?: { jobTitle: string; clientName?: string | null };
  interviews?: CandidateInterviewItem[];
}) {
  return (
    <div className="space-y-3 duration-300 animate-in fade-in slide-in-from-bottom-1">
      {scorecards.map((scorecard) => {
        const meta = RATING_META[scorecard.rating];
        const interview = interviews.find((item) => item.id === scorecard.interviewId);
        return (
          <div
            key={scorecard.id}
            className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
          >
            <span
              aria-hidden
              className={cn("absolute inset-y-0 left-0 w-1", meta.accent)}
            />
            <div className="space-y-2 p-5 pl-6">
              {application ? <div className="text-sm">
                {application.clientName ? <p className="text-xs text-muted-foreground">{application.clientName}</p> : null}
                <p className="font-medium">{application.jobTitle}</p>
              </div> : null}
              {interview ? <p className="text-xs text-muted-foreground">{interview.title ?? interviewTypeLabel(interview.type)} interview · <RelativeTime value={interview.scheduledAt} /></p> : null}
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-semibold",
                    meta.className,
                  )}
                >
                  <meta.icon className="size-4" strokeWidth={2} />
                  {meta.label}
                </span>
                {scorecard.stageName ? (
                  <Badge variant="neutral">{scorecard.stageName}</Badge>
                ) : null}
              </div>
              {scorecard.comment ? (
                <p className="whitespace-pre-line text-sm">{scorecard.comment}</p>
              ) : null}
              {Array.isArray(scorecard.criteria) ? <dl className="space-y-3">{scorecard.criteria.filter((item): item is SavedCriterion => item?.version === 1).map((criterion) => <div key={criterion.id} className="border-t pt-3 text-sm">
                <dt className="font-medium">{criterion.name}</dt>
                {criterion.guidance ? <dd className="whitespace-pre-wrap text-xs text-muted-foreground">{criterion.guidance}</dd> : null}
                <dd className="mt-1">{criterionValue(criterion)}</dd>
                {criterion.comment ? <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{criterion.comment}</dd> : null}
              </div>)}</dl> : null}
              <p className="text-xs text-muted-foreground">
                {scorecard.authorName ?? "Someone"} ·{" "}
                <RelativeTime value={scorecard.createdAt} />
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
