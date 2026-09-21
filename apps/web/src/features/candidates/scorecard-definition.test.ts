import { describe, expect, it } from "vitest";
import {
  definitionSchema,
  definitionToken,
  freezeCriteria,
  type ScorecardDimension,
} from "./scorecard-definition";

const dimension: ScorecardDimension = {
  id: "f6a044ee-411b-4d5c-8cac-01438b66e053",
  name: "Technical familiarity",
  guidance: "Describe examples",
  type: "scale",
  anchors: ["None", "Limited", "Adequate", "Experienced", "Expert"],
};
describe("structured scorecards", () => {
  it("preserves unassessed separately from false and validates each rating format", () => {
    for (const [type, valid, invalid] of [
      ["scale", 3, 6],
      ["boolean", false, "yes"],
      ["recommendation", "weak", "positive"],
    ] as const) {
      const definition = [{ ...dimension, type }];
      const submission = (value: string | number | boolean | null) => ({
        definitionToken: definitionToken(definition),
        responses: [{ id: dimension.id, value, comment: "Evidence" }],
      });
      expect(freezeCriteria(definition, submission(valid))[0].value).toBe(
        valid,
      );
      expect(freezeCriteria(definition, submission(null))[0].value).toBeNull();
      expect(() => freezeCriteria(definition, submission(invalid))).toThrow(
        "Invalid dimension rating",
      );
    }
  });
  it("requires anchors, unique dimensions, complete responses and current definition", () => {
    expect(
      definitionSchema.safeParse([
        { ...dimension, anchors: ["", "", "", "", ""] },
      ]).success,
    ).toBe(false);
    expect(definitionSchema.safeParse([dimension, dimension]).success).toBe(
      false,
    );
    expect(() =>
      freezeCriteria([dimension], {
        definitionToken: definitionToken([dimension]),
        responses: [],
      }),
    ).toThrow();
    expect(() =>
      freezeCriteria([{ ...dimension, guidance: "Changed" }], {
        definitionToken: definitionToken([dimension]),
        responses: [{ id: dimension.id, value: 1, comment: "" }],
      }),
    ).toThrow("changed");
    expect(freezeCriteria([])).toEqual([]);
  });
});
