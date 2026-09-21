import { describe, expect, it } from "vitest";
import { applySelectionRange } from "./use-range-selection";

describe("visible row range selection", () => {
  const ids = ["a", "b", "c", "d"];
  it("selects an inclusive range in either direction and preserves other selections", () => {
    expect([
      ...applySelectionRange(new Set(["a", "outside"]), ids, "c", "a", true),
    ]).toEqual(["a", "outside", "b", "c"]);
    expect([
      ...applySelectionRange(new Set(["d"]), ids, "b", "d", true),
    ]).toEqual(["d", "b", "c"]);
  });
  it("deselects the range when toggling a selected endpoint", () => {
    expect([...applySelectionRange(new Set(ids), ids, "c", "a", true)]).toEqual(
      ["d"],
    );
  });
  it("never selects hidden items and falls back to one row when the anchor disappeared", () => {
    expect([
      ...applySelectionRange(new Set(["a"]), ["a", "d"], "d", "a", true),
    ]).toEqual(["a", "d"]);
    expect([
      ...applySelectionRange(new Set(["a"]), ["b", "c", "d"], "d", "a", true),
    ]).toEqual(["a", "d"]);
  });
  it("ordinary clicks toggle only one row; missing targets leave selection unchanged", () => {
    expect([
      ...applySelectionRange(new Set(["a"]), ids, "d", "a", false),
    ]).toEqual(["a", "d"]);
    expect([
      ...applySelectionRange(new Set(["a"]), ids, "missing", "a", true),
    ]).toEqual(["a"]);
  });
});
