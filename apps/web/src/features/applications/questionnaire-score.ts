import type { JobApplicationConfig } from "@/features/jobs/config";
import { parseMultiSelectAnswer } from "./multi-select";

export type QuestionnaireScore = {
  version: 1;
  score: number;
  earned: number;
  maximum: number;
  threshold: number | null;
  qualified: boolean;
  questions: {
    id: string;
    label: string;
    type: string;
    weight: number;
    selected: string[];
    answers: { option: string; score: number }[];
    earned: number;
    maximum: number;
  }[];
};

/** Optional unanswered questions earn zero. Multi-select uses the mean of the
 * selected choice scores, so ticking every box does not accumulate points. */
export function scoreQuestionnaire(
  config: JobApplicationConfig,
  answers: Record<string, string>,
): QuestionnaireScore | null {
  const questions = config.questions
    .filter((question) => question.scoring)
    .map((question) => {
      const scoring = question.scoring!;
      const raw = (answers[question.id] ?? "").trim();
      const selected =
        question.type === "multiselect"
          ? parseMultiSelectAnswer(raw)
          : raw
            ? [raw]
            : [];
      if (
        !selected ||
        new Set(selected).size !== selected.length ||
        selected.some(
          (option) =>
            !scoring.answers.some((answer) => answer.option === option),
        ) ||
        (question.required && !selected.length)
      )
        throw new Error("Invalid scored questionnaire answer.");
      const maximum =
        Math.max(...scoring.answers.map((answer) => answer.score)) *
        scoring.weight;
      const earned = selected.length
        ? (selected.reduce(
            (sum, option) =>
              sum +
              scoring.answers.find((answer) => answer.option === option)!.score,
            0,
          ) /
            selected.length) *
          scoring.weight
        : 0;
      return {
        id: question.id,
        label: question.label,
        type: question.type,
        weight: scoring.weight,
        selected,
        answers: scoring.answers.map((answer) => ({ ...answer })),
        earned,
        maximum,
      };
    });
  if (!questions.length) return null;
  const earned = questions.reduce((sum, question) => sum + question.earned, 0);
  const maximum = questions.reduce(
    (sum, question) => sum + question.maximum,
    0,
  );
  if (!maximum) throw new Error("Questionnaire has no available points.");
  const score = Math.round((earned / maximum) * 10000) / 100;
  const threshold = config.qualifiedScoreThreshold ?? null;
  return {
    version: 1,
    score,
    earned,
    maximum,
    threshold,
    qualified: threshold !== null && (earned / maximum) * 100 >= threshold,
    questions,
  };
}
