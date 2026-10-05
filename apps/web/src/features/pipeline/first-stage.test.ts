import { describe, expect, it } from "vitest";

import { firstStageIds } from "./first-stage";

describe("first stage per job", () => {
  it("picks the lowest-order stage of each job regardless of its name", () => {
    const ids = firstStageIds([
      { id: "a-screening", jobId: "a", order: 20 },
      { id: "a-applied", jobId: "a", order: 10 },
      { id: "b-new", jobId: "b", order: 2 },
      { id: "b-screening", jobId: "b", order: 3 },
    ]);

    expect(Array.from(ids).sort()).toEqual(["a-applied", "b-new"]);
  });

  it("breaks an order tie by id so it matches the SQL ordering", () => {
    const ids = firstStageIds([
      { id: "stage-2", jobId: "a", order: 1 },
      { id: "stage-1", jobId: "a", order: 1 },
    ]);

    expect(Array.from(ids)).toEqual(["stage-1"]);
  });

  it("treats stages without a job id as one pipeline", () => {
    expect(
      Array.from(
        firstStageIds([
          { id: "second", order: 2 },
          { id: "first", order: 1 },
        ]),
      ),
    ).toEqual(["first"]);
  });

  it("returns nothing for a job without stages", () => {
    expect(firstStageIds([]).size).toBe(0);
  });
});
