import { z } from "zod";

export const dimensionSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    guidance: z.string().trim().max(2000),
    type: z.enum(["recommendation", "scale", "boolean"]),
    anchors: z.array(z.string().trim().max(300)).length(5),
  })
  .refine(
    (value) => value.type !== "scale" || value.anchors.every(Boolean),
    "Define what each of the five scale ratings means.",
  );
export const definitionSchema = z
  .array(dimensionSchema)
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Dimensions must have unique IDs.",
  );
export type ScorecardDimension = z.infer<typeof dimensionSchema>;
export const responsesSchema = z
  .array(
    z.object({
      id: z.uuid(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      comment: z.string().trim().max(3000),
    }),
  )
  .max(20);
export type DimensionResponse = z.infer<typeof responsesSchema>[number];
export type ScorecardSubmission = {
  definitionToken: string;
  responses: DimensionResponse[];
};
export type SavedCriterion = ScorecardDimension & {
  value: DimensionResponse["value"];
  comment: string;
  version: 1;
};

export function definitionToken(definition: ScorecardDimension[]) {
  return JSON.stringify(definition);
}
export class ScorecardValidationError extends Error {}

export function freezeCriteria(
  definition: ScorecardDimension[],
  submission?: ScorecardSubmission,
): SavedCriterion[] {
  if (!definition.length && !submission) return [];
  if (!submission || submission.definitionToken !== definitionToken(definition))
    throw new ScorecardValidationError(
      "The job scorecard changed. Reopen the assessment to load the current dimensions.",
    );
  const responses = responsesSchema.parse(submission.responses);
  if (
    responses.length !== definition.length ||
    new Set(responses.map((item) => item.id)).size !== definition.length
  )
    throw new ScorecardValidationError(
      "Complete each dimension or choose Not assessed.",
    );
  return definition.map((dimension) => {
    const response = responses.find((item) => item.id === dimension.id);
    if (!response) throw new ScorecardValidationError("Missing dimension.");
    const value = response.value;
    const valid =
      value === null ||
      (dimension.type === "scale"
        ? typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= 5
        : dimension.type === "boolean"
          ? typeof value === "boolean"
          : typeof value === "string" &&
            ["strong", "mixed", "weak"].includes(value));
    if (!valid) throw new ScorecardValidationError("Invalid dimension rating.");
    return { ...dimension, ...response, version: 1 };
  });
}

export function criterionValue(criterion: SavedCriterion) {
  if (criterion.value === null) return "Not assessed";
  if (criterion.type === "boolean") return criterion.value ? "Yes" : "No";
  if (criterion.type === "scale")
    return `${criterion.value}/5 · ${criterion.anchors[Number(criterion.value) - 1]}`;
  return String(criterion.value).replace(/^./, (letter) =>
    letter.toUpperCase(),
  );
}
