"use client";

import { ScoreRing } from "@/features/candidates/AiScoreCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ScoreSort = "manual" | "questionnaireScore" | "aiScore";
type Scores = { questionnaireScore?: number | null; aiScore?: number | null };

export function PipelineScores({ application }: { application: Scores }) {
  return (
    <div className="flex items-center gap-4">
      {(
        [
          ["Questionnaire", application.questionnaireScore],
          ["AI fit", application.aiScore],
        ] as const
      ).map(([label, score]) => (
        <div
          key={label}
          className="flex flex-col items-center gap-1"
          aria-label={`${label}: ${score == null ? "not scored" : `${score} out of 100`}`}
          title={`${label}: ${score == null ? "Not scored" : `${score}/100`}`}
        >
          {score == null ? (
            <span className="flex size-12 items-center justify-center rounded-full border-4 border-muted text-sm text-muted-foreground">
              —
            </span>
          ) : (
            <ScoreRing score={Math.round(score)} compact />
          )}
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function matchesScoreFilters(
  application: Scores,
  questionnaire: string,
  ai: string,
) {
  return (
    (questionnaire === "" ||
      (application.questionnaireScore != null &&
        application.questionnaireScore >= Number(questionnaire))) &&
    (ai === "" ||
      (application.aiScore != null && application.aiScore >= Number(ai)))
  );
}

export function compareScores(a: Scores, b: Scores, sort: ScoreSort) {
  return sort === "manual" ? 0 : (b[sort] ?? -1) - (a[sort] ?? -1);
}

export function PipelineScoreControls({
  sort,
  onSort,
  questionnaire,
  onQuestionnaire,
  ai,
  onAi,
}: {
  sort: ScoreSort;
  onSort: (value: ScoreSort) => void;
  questionnaire: string;
  onQuestionnaire: (value: string) => void;
  ai: string;
  onAi: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Sort by</span>
        <Select
          value={sort}
          onValueChange={(value) => onSort(value as ScoreSort)}
        >
          <SelectTrigger className="w-56" aria-label="Sort applications">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Pipeline order</SelectItem>
            <SelectItem value="questionnaireScore">
              Questionnaire: highest first
            </SelectItem>
            <SelectItem value="aiScore">AI fit: highest first</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {(
        [
          ["Minimum questionnaire", questionnaire, onQuestionnaire],
          ["Minimum AI fit", ai, onAi],
        ] as const
      ).map(([label, value, onChange]) => (
        <label key={label} className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{label}</span>
          <Input
            aria-label={label}
            className="w-36"
            type="number"
            min={0}
            max={100}
            value={value}
            placeholder="Any score"
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
