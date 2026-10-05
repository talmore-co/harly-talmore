import { describe, expect, it } from "vitest";

import { filterCommandItems } from "./command-filter";

const items = [
  { label: "Reports" },
  { label: "Career page" },
  { label: "Team & access" },
  { label: "Create new job" },
  { label: "Jobs" },
];

const labels = (query: string) =>
  filterCommandItems(items, query).map((item) => item.label);

describe("filterCommandItems", () => {
  it("keeps every item for an empty or whitespace query", () => {
    expect(labels("")).toHaveLength(items.length);
    expect(labels("   ")).toHaveLength(items.length);
  });

  it("matches case-insensitively on part of the label", () => {
    expect(labels("reports")).toEqual(["Reports"]);
    expect(labels("REP")).toEqual(["Reports"]);
    expect(labels("job")).toEqual(["Create new job", "Jobs"]);
  });

  it("requires every word, in any order", () => {
    expect(labels("job new")).toEqual(["Create new job"]);
    expect(labels("career jobs")).toEqual([]);
  });

  it("returns nothing when no label matches", () => {
    expect(labels("zzz")).toEqual([]);
  });
});
