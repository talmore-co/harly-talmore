import { describe, expect, it } from "vitest";

import {
  statusAfterStageMove,
  statusForStageName,
  terminalStageNameForStatus,
} from "./state";

describe("pipeline state mapping", () => {
  it.each([
    ["Hired", "hired"],
    [" rejected ", "rejected"],
    ["Interview", "active"],
    ["Offer", "active"],
  ] as const)("maps %s to %s", (stageName, status) => {
    expect(statusForStageName(stageName)).toBe(status);
  });

  it("only maps terminal statuses to terminal stage names", () => {
    expect(terminalStageNameForStatus("hired")).toBe("Hired");
    expect(terminalStageNameForStatus("rejected")).toBe("Rejected");
    expect(terminalStageNameForStatus("active")).toBeNull();
    expect(terminalStageNameForStatus("withdrawn")).toBeNull();
  });
});

describe("status after a pipeline move", () => {
  const statuses = ["active", "hired", "rejected", "withdrawn"] as const;

  it.each(statuses)(
    "keeps %s when a card is reordered inside its stage",
    (currentStatus) => {
      // Also inside a terminal column: a reorder is never a status decision.
      for (const stageName of ["Interview", "Hired", "Rejected"]) {
        expect(
          statusAfterStageMove({
            currentStatus,
            fromStageName: stageName,
            toStageName: stageName,
            sameStage: true,
          }),
        ).toBe(currentStatus);
      }
    },
  );

  it.each([
    ["Hired", "hired"],
    ["Rejected", "rejected"],
    ["rejected by client", "rejected"],
  ] as const)("sets the terminal status when moved into %s", (toStageName, status) => {
    for (const currentStatus of statuses) {
      expect(
        statusAfterStageMove({
          currentStatus,
          fromStageName: "Interview",
          toStageName,
          sameStage: false,
        }),
      ).toBe(status);
    }
  });

  it.each(["withdrawn", "rejected", "hired"] as const)(
    "does not reactivate a %s application moved between working stages",
    (currentStatus) => {
      expect(
        statusAfterStageMove({
          currentStatus,
          fromStageName: "Screening",
          toStageName: "Interview",
          sameStage: false,
        }),
      ).toBe(currentStatus);
    },
  );

  it("reactivates an application dragged out of its terminal stage", () => {
    expect(
      statusAfterStageMove({
        currentStatus: "rejected",
        fromStageName: "Rejected by client",
        toStageName: "Interview",
        sameStage: false,
      }),
    ).toBe("active");
    expect(
      statusAfterStageMove({
        currentStatus: "hired",
        fromStageName: "Hired",
        toStageName: "Offer",
        sameStage: false,
      }),
    ).toBe("active");
  });

  it("keeps a withdrawn application withdrawn when it leaves a terminal stage", () => {
    expect(
      statusAfterStageMove({
        currentStatus: "withdrawn",
        fromStageName: "Rejected",
        toStageName: "Interview",
        sameStage: false,
      }),
    ).toBe("withdrawn");
  });

  it("treats an unknown previous stage as a working stage", () => {
    expect(
      statusAfterStageMove({
        currentStatus: "withdrawn",
        fromStageName: null,
        toStageName: "Interview",
        sameStage: false,
      }),
    ).toBe("withdrawn");
    expect(
      statusAfterStageMove({
        currentStatus: "active",
        fromStageName: null,
        toStageName: "Interview",
        sameStage: false,
      }),
    ).toBe("active");
  });
});
