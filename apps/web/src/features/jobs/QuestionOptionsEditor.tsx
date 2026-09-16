"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { JobApplicationQuestion } from "./config";

export function QuestionOptionsEditor({
  question,
  onChange,
}: {
  question: JobApplicationQuestion;
  onChange: (value: Partial<JobApplicationQuestion>) => void;
}) {
  const [disabledScoring, setDisabledScoring] = useState(question.scoring);
  const scoring = question.scoring ?? disabledScoring;
  const rows = (question.options ?? []).map((option, index) => ({
    option,
    score:
      (scoring?.answers[index]?.option === option
        ? scoring.answers[index].score
        : scoring?.answers.find((answer) => answer.option === option)?.score) ??
      0,
  }));
  function updateRows(answers: { option: string; score: number }[]) {
    const nextScoring = scoring ? { ...scoring, answers } : undefined;
    if (!question.scoring) setDisabledScoring(nextScoring);
    onChange({
      options: answers.map((answer) => answer.option),
      scoring: question.scoring ? nextScoring : undefined,
    });
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-lg bg-background/60 px-3 py-2.5">
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={Boolean(question.scoring)}
            onCheckedChange={(checked) => {
              if (checked)
                onChange({
                  scoring: { weight: scoring?.weight ?? 1, answers: rows },
                });
              else {
                setDisabledScoring(question.scoring);
                onChange({ scoring: undefined });
              }
            }}
          />
          Score this question
        </label>
        {question.scoring && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Question weight
            <Input
              aria-label={`Question weight for ${question.label || "question"}`}
              type="number"
              min={1}
              max={10}
              step={1}
              value={question.scoring.weight}
              onChange={(event) =>
                onChange({
                  scoring: {
                    ...question.scoring!,
                    weight: Number(event.target.value),
                  },
                })
              }
              className="h-8 w-16 rounded-md bg-background px-2 text-center tabular-nums"
            />
            <span className="text-xs">/ 10</span>
          </label>
        )}
      </div>
      <div className="space-y-2">
        <div
          className={`grid items-center gap-2 text-xs font-medium text-muted-foreground ${question.scoring ? "grid-cols-[minmax(0,1fr)_5rem_2rem]" : "grid-cols-[minmax(0,1fr)_2rem]"}`}
        >
          <span>Answer options</span>
          {question.scoring && <span className="text-center">Score / 10</span>}
          <span />
        </div>
        {rows.map((answer, index) => (
          <div
            key={index}
            className={`grid items-center gap-2 ${question.scoring ? "grid-cols-[minmax(0,1fr)_5rem_2rem]" : "grid-cols-[minmax(0,1fr)_2rem]"}`}
          >
            <Input
              aria-label={`Option ${index + 1}`}
              placeholder={`Option ${index + 1}`}
              maxLength={120}
              value={answer.option}
              onChange={(event) =>
                updateRows(
                  rows.map((row, i) =>
                    i === index ? { ...row, option: event.target.value } : row,
                  ),
                )
              }
              className="min-w-0 bg-background"
            />
            {question.scoring && (
              <Input
                aria-label={`Score for option ${index + 1}`}
                type="number"
                min={0}
                max={10}
                step={1}
                value={answer.score}
                onChange={(event) =>
                  updateRows(
                    rows.map((row, i) =>
                      i === index
                        ? { ...row, score: Number(event.target.value) }
                        : row,
                    ),
                  )
                }
                className="bg-background px-2 text-center tabular-nums"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={`Remove option ${index + 1}`}
              onClick={() => updateRows(rows.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={rows.length >= 20}
          className="gap-1.5 px-2 text-muted-foreground"
          onClick={() => updateRows([...rows, { option: "", score: 0 }])}
        >
          <Plus className="size-4" />
          Add option
        </Button>
      </div>
      {question.scoring && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          The weight controls how much this question contributes to the total.
          At least one answer must score above zero. Unanswered optional
          questions earn zero.
          {question.type === "multiselect"
            ? " Multiple selections use their average score."
            : ""}
        </p>
      )}
    </div>
  );
}
