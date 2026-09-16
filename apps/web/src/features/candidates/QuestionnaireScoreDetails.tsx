import { z } from "zod";
const snapshotSchema = z.object({
  version: z.literal(1),
  score: z.number(),
  earned: z.number(),
  maximum: z.number(),
  questions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      weight: z.number(),
      selected: z.array(z.string()),
      earned: z.number(),
      maximum: z.number(),
    }),
  ),
});
export function QuestionnaireScoreDetails({ snapshot }: { snapshot: unknown }) {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  return (
    <details className="mt-3 rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Questionnaire score: {parsed.data.score}%
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Calculated when this application was submitted. Later questionnaire
        edits do not change this score.
      </p>
      <dl className="space-y-3">
        {parsed.data.questions.map((question) => (
          <div key={question.id}>
            <dt className="font-medium">{question.label}</dt>
            <dd className="text-muted-foreground">
              {question.selected.join(", ") || "Unanswered"} · Weight{" "}
              {question.weight} · {Number(question.earned.toFixed(2))}/
              {question.maximum} points
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
