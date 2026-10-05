import { describe, expect, it } from "vitest";

import {
  allVisibleSelected,
  toggleVisibleSelection,
  visibleSelection,
} from "./selection";

describe("talent pool selection", () => {
  it("drops selected rows that the current filter hides", () => {
    const selected = new Set(["a", "b", "c"]);
    expect(visibleSelection(selected, ["c", "a", "d"])).toEqual(["c", "a"]);
    expect(visibleSelection(selected, [])).toEqual([]);
  });

  it("treats select-all as a statement about visible rows only", () => {
    // Two hidden selections must not make a two-row view look fully selected.
    expect(allVisibleSelected(new Set(["x", "y"]), ["a", "b"])).toBe(false);
    expect(allVisibleSelected(new Set(["a", "b", "x"]), ["a", "b"])).toBe(true);
    expect(allVisibleSelected(new Set(["a"]), ["a", "b"])).toBe(false);
    expect(allVisibleSelected(new Set(), [])).toBe(false);
  });

  it("selects every visible row and keeps hidden selections", () => {
    const next = toggleVisibleSelection(new Set(["x"]), ["a", "b"]);
    expect([...next].sort()).toEqual(["a", "b", "x"]);
  });

  it("clears only the visible rows when they are all selected", () => {
    const next = toggleVisibleSelection(new Set(["a", "b", "x"]), ["a", "b"]);
    expect([...next]).toEqual(["x"]);
  });
});
