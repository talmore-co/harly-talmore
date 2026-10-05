import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(),
}));

import {
  candidateDirectoryNeighboursQuery,
  neighboursFromRankedRows,
} from "./directory-neighbours";

describe("candidate directory neighbours", () => {
  it("splits the ranked window around the open candidate, nearest first", () => {
    expect(
      neighboursFromRankedRows("c", [
        { id: "a", position: 7, total: 40 },
        { id: "b", position: 8, total: 40 },
        { id: "c", position: 9, total: 40 },
        { id: "d", position: 10, total: 40 },
      ]),
    ).toEqual({
      position: 9,
      total: 40,
      previousIds: ["b", "a"],
      nextIds: ["d"],
    });
  });

  it("reports no position when the candidate is outside the filtered list", () => {
    expect(neighboursFromRankedRows("c", [])).toEqual({
      position: null,
      total: 0,
      previousIds: [],
      nextIds: [],
    });
  });

  it("ranks in SQL and only returns the rows around the candidate", () => {
    const { sql, params } = candidateDirectoryNeighboursQuery(
      "workspace-1",
      "candidate-1",
      { query: "ada", stage: "Interview", sort: "name" },
    ).toSQL();

    expect(sql).toContain('with "ranked_candidates" as');
    expect(sql).toContain(
      'row_number() over (order by "candidates"."last_name" asc, "candidates"."first_name" asc, "candidates"."id" asc)',
    );
    expect(sql).toContain('"candidates"."deleted_at" is null');
    expect(sql).toContain('"job_stages"."name" = ');
    expect(sql).toMatch(
      /where "position" between \(select "position" from "ranked_candidates" where "ranked_candidates"\."id" = \$\d+\) - 5 and \(select "position" from "ranked_candidates" where "ranked_candidates"\."id" = \$\d+\) \+ 5/,
    );
    expect(params).toContain("candidate-1");
    expect(params).toContain("%ada%");
    expect(params).toContain("Interview");
  });
});
