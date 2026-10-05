import { describe, expect, it } from "vitest";

import {
  isOutcomeStage,
  newStageIndex,
  outcomeStageName,
  validateNewStageName,
  validateStageDelete,
  validateStageOrder,
  validateStageRename,
} from "./stage-rules";

const stages = [
  { id: "applied", name: "Applied" },
  { id: "screening", name: "Screening" },
  { id: "hired", name: "Hired" },
  { id: "rejected", name: "Rejected" },
  { id: "rejected-client", name: "Rejected by client" },
];
const stage = (id: string) => stages.find((item) => item.id === id)!;

describe("outcome stages", () => {
  it("recognises the names the rest of the product keys on", () => {
    expect(isOutcomeStage(" hired ")).toBe(true);
    expect(isOutcomeStage("REJECTED BY CLIENT")).toBe(true);
    expect(isOutcomeStage("Applied")).toBe(false);
    expect(outcomeStageName("rejected by Client")).toBe("Rejected by client");
    expect(outcomeStageName("Offer")).toBeNull();
  });
});

describe("adding a stage", () => {
  it("trims and collapses whitespace", () => {
    expect(validateNewStageName("  Final   interview ", stages)).toEqual({
      ok: true,
      value: "Final interview",
    });
  });

  it.each(["", "   ", null, 42])("rejects an empty name: %j", (name) => {
    expect(validateNewStageName(name, stages).ok).toBe(false);
  });

  it("rejects names over the length limit", () => {
    expect(validateNewStageName("x".repeat(61), stages).ok).toBe(false);
    expect(validateNewStageName("x".repeat(60), stages).ok).toBe(true);
  });

  it("rejects a duplicate regardless of case", () => {
    expect(validateNewStageName("screening", stages)).toEqual({
      ok: false,
      error: 'This job already has a "screening" stage.',
    });
    expect(validateNewStageName("HIRED", stages).ok).toBe(false);
  });

  it("stores a missing outcome stage with its canonical spelling", () => {
    const withoutClient = stages.filter((item) => item.id !== "rejected-client");
    expect(validateNewStageName("rejected BY client", withoutClient)).toEqual({
      ok: true,
      value: "Rejected by client",
    });
  });

  it("does not let an outcome stage become the only stage", () => {
    expect(validateNewStageName("Hired", []).ok).toBe(false);
    expect(validateNewStageName("Applied", []).ok).toBe(true);
  });
});

describe("renaming a stage", () => {
  it("allows a working stage to be renamed", () => {
    expect(validateStageRename(stage("screening"), "Phone screen", stages)).toEqual({
      ok: true,
      value: "Phone screen",
    });
  });

  it("allows changing only the capitalisation of its own name", () => {
    expect(validateStageRename(stage("screening"), "SCREENING", stages).ok).toBe(true);
  });

  it.each(["hired", "rejected", "rejected-client"])(
    "protects the %s outcome stage",
    (id) => {
      const result = validateStageRename(stage(id), "Something else", stages);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/cannot be renamed/);
    },
  );

  it("treats an unchanged name as a no-op, even for outcome stages", () => {
    expect(validateStageRename(stage("hired"), "Hired", stages)).toEqual({
      ok: true,
      value: "Hired",
    });
  });

  it("does not let a working stage take an outcome name", () => {
    const withoutHired = stages.filter((item) => item.id !== "hired");
    const result = validateStageRename(stage("screening"), " hired", withoutHired);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/reserved/);
  });

  it("rejects a name another stage already uses", () => {
    expect(validateStageRename(stage("screening"), "applied", stages).ok).toBe(false);
  });
});

describe("reordering stages", () => {
  const ids = stages.map((item) => item.id);

  it("accepts a permutation of the job's stages", () => {
    const next = ["screening", "applied", "rejected", "hired", "rejected-client"];
    expect(validateStageOrder(stages, next)).toEqual({ ok: true, value: next });
  });

  it.each([
    ["a missing stage", ids.slice(1)],
    ["a duplicate", [...ids.slice(0, 4), "applied"]],
    ["an unknown stage", [...ids.slice(0, 4), "other-job-stage"]],
    ["a non-array", "applied,screening"],
    ["non-string ids", [1, 2, 3, 4, 5]],
  ])("rejects %s", (_label, next) => {
    expect(validateStageOrder(stages, next).ok).toBe(false);
  });

  it("keeps an outcome stage out of the first position", () => {
    const result = validateStageOrder(stages, [
      "rejected",
      "applied",
      "screening",
      "hired",
      "rejected-client",
    ]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/cannot come first/);
  });
});

describe("deleting a stage", () => {
  const unused = { applications: 0, history: 0 };

  it("allows deleting a working stage nobody has been in", () => {
    expect(validateStageDelete(stage("screening"), stages, unused)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("protects outcome stages even when empty", () => {
    const result = validateStageDelete(stage("rejected"), stages, unused);
    expect(!result.ok && result.error).toMatch(/cannot be deleted/);
  });

  it("requires the stage to be empty", () => {
    const result = validateStageDelete(stage("screening"), stages, {
      applications: 2,
      history: 0,
    });
    expect(!result.ok && result.error).toBe(
      'Move the 2 candidates in "Screening" to another stage first.',
    );
  });

  it("keeps a stage that is part of candidate history", () => {
    const result = validateStageDelete(stage("screening"), stages, {
      applications: 0,
      history: 3,
    });
    expect(!result.ok && result.error).toMatch(/part of their history/);
  });

  it("keeps at least one working stage", () => {
    const onlyOne = stages.filter((item) => item.id !== "screening");
    const result = validateStageDelete(stage("applied"), onlyOne, unused);
    expect(!result.ok && result.error).toMatch(/at least one stage/);
  });
});

describe("placing a new stage", () => {
  it("goes after the last working stage and before the outcome stages", () => {
    expect(newStageIndex(stages, "Offer")).toBe(2);
  });

  it("appends when the pipeline does not end in outcome stages", () => {
    expect(newStageIndex(stages.slice(0, 2), "Offer")).toBe(2);
    expect(newStageIndex([], "Applied")).toBe(0);
  });

  it("appends an outcome stage", () => {
    expect(newStageIndex(stages.slice(0, 4), "Rejected by client")).toBe(4);
  });
});
