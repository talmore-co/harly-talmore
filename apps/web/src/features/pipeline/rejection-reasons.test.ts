import { describe, expect, it } from "vitest";
import {
  REJECTION_NOTE_MAX_LENGTH,
  REJECTION_REASONS,
  countRejectionReasons,
  parseRejectionDetails,
  rejectionDetailsPatch,
  rejectionReasonLabel,
} from "./rejection-reasons";

describe("rejection reasons", () => {
  it("keeps codes unique and labels every code", () => {
    const codes = REJECTION_REASONS.map((reason) => reason.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(rejectionReasonLabel("salary_expectations")).toBe(
      "Salary expectations",
    );
    expect(rejectionReasonLabel(null)).toBe("Unspecified");
    expect(rejectionReasonLabel("retired_code")).toBe("Unspecified");
  });

  it("treats the reason and note as optional", () => {
    expect(parseRejectionDetails({})).toEqual({
      ok: true,
      details: { reason: null, note: null },
    });
    expect(
      parseRejectionDetails({ rejectionReason: null, rejectionNote: "   " }),
    ).toEqual({ ok: true, details: { reason: null, note: null } });
  });

  it("accepts known codes and trims the note", () => {
    expect(
      parseRejectionDetails({
        rejectionReason: "position_filled",
        rejectionNote: "  Filled internally  ",
      }),
    ).toEqual({
      ok: true,
      details: { reason: "position_filled", note: "Filled internally" },
    });
  });

  it("rejects unknown codes, non-string notes and oversized notes", () => {
    expect(parseRejectionDetails({ rejectionReason: "too_expensive" })).toEqual(
      { ok: false, error: "Invalid rejection reason." },
    );
    expect(parseRejectionDetails({ rejectionReason: 3 }).ok).toBe(false);
    expect(parseRejectionDetails({ rejectionNote: { text: "x" } }).ok).toBe(
      false,
    );
    expect(
      parseRejectionDetails({
        rejectionNote: "x".repeat(REJECTION_NOTE_MAX_LENGTH + 1),
      }).ok,
    ).toBe(false);
    expect(
      parseRejectionDetails({
        rejectionNote: "x".repeat(REJECTION_NOTE_MAX_LENGTH),
      }).ok,
    ).toBe(true);
  });

  it("stores details on rejection and clears them when the application leaves rejected", () => {
    const details = { reason: "team_fit" as const, note: "Panel feedback" };
    expect(rejectionDetailsPatch("active", "rejected", details)).toEqual({
      rejectionReason: "team_fit",
      rejectionNote: "Panel feedback",
    });
    for (const next of ["active", "hired", "withdrawn"]) {
      expect(rejectionDetailsPatch("rejected", next, details)).toEqual({
        rejectionReason: null,
        rejectionNote: null,
      });
    }
  });

  it("does not wipe an earlier reason when a rejected application is rejected again without one", () => {
    expect(rejectionDetailsPatch("rejected", "rejected")).toEqual({});
    expect(
      rejectionDetailsPatch("rejected", "rejected", { reason: null, note: null }),
    ).toEqual({});
    expect(rejectionDetailsPatch("active", "rejected")).toEqual({
      rejectionReason: null,
      rejectionNote: null,
    });
    expect(
      rejectionDetailsPatch("rejected", "rejected", {
        reason: "duplicate",
        note: null,
      }),
    ).toEqual({ rejectionReason: "duplicate", rejectionNote: null });
  });

  it("counts reasons in list order with a trailing Unspecified bucket", () => {
    const counts = countRejectionReasons([
      "duplicate",
      "not_qualified",
      "duplicate",
      null,
      undefined,
      "retired_code",
    ]);
    expect(counts.map((row) => row.code)).toEqual([
      ...REJECTION_REASONS.map((reason) => reason.code),
      null,
    ]);
    expect(counts.find((row) => row.code === "duplicate")?.count).toBe(2);
    expect(counts.find((row) => row.code === "not_qualified")?.count).toBe(1);
    expect(counts.at(-1)).toEqual({
      code: null,
      label: "Unspecified",
      count: 3,
    });
    expect(counts.reduce((sum, row) => sum + row.count, 0)).toBe(6);
  });
});
