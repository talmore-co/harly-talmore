import { describe, expect, it } from "vitest";

import {
  applyPipelineViewParams,
  readScoreSort,
  readScoreThreshold,
  readStatusFilter,
  readText,
} from "./view-params";

const params = (query: string) => new URLSearchParams(query);

describe("pipeline view params", () => {
  it("reads filters back from the URL", () => {
    const current = params(
      "jobId=job-1&q=ada&status=withdrawn&sort=aiScore&minScore=40&minAi=075",
    );

    expect(readText(current, "query")).toBe("ada");
    expect(readStatusFilter(current)).toBe("withdrawn");
    expect(readScoreSort(current, "manual")).toBe("aiScore");
    expect(readScoreThreshold(current, "minimumQuestionnaire")).toBe("40");
    expect(readScoreThreshold(current, "minimumAi")).toBe("75");
  });

  it("falls back to defaults for missing or invalid values", () => {
    const current = params("status=archived&sort=random&minScore=101&minAi=-5");

    expect(readText(current, "query")).toBe("");
    expect(readStatusFilter(current)).toBe("all");
    expect(readScoreSort(current, "newest")).toBe("newest");
    expect(readScoreThreshold(current, "minimumQuestionnaire")).toBe("");
    expect(readScoreThreshold(current, "minimumAi")).toBe("");
  });

  it("ignores manual order where the view cannot sort manually", () => {
    expect(readScoreSort(params("sort=manual"), "newest", false)).toBe("newest");
    expect(readScoreSort(params("sort=manual"), "newest")).toBe("manual");
  });

  it("writes only non-default values and keeps unrelated params", () => {
    const next = applyPipelineViewParams("jobId=job-1&view=board&q=old&minAi=50", {
      query: "ada lovelace",
      sort: null,
      minimumAi: "",
      status: "rejected",
    });

    expect(Object.fromEntries(params(next))).toEqual({
      jobId: "job-1",
      view: "board",
      q: "ada lovelace",
      status: "rejected",
    });
  });

  it("is stable when nothing changed", () => {
    const current = params("jobId=job-1&q=ada").toString();
    expect(applyPipelineViewParams(current, { query: "ada" })).toBe(current);
  });
});
