import { describe, expect, it } from "vitest";

import {
  bulkDecisionConfirmationMessage,
  hireConfirmationCopy,
} from "./confirmation";

describe("bulk pipeline decision confirmation", () => {
  it("makes the irreversible bulk hire/reject scope explicit", () => {
    expect(bulkDecisionConfirmationMessage("hired", 3)).toMatch(
      /hire 3 applications/i,
    );
    expect(bulkDecisionConfirmationMessage("rejected", 2)).toMatch(
      /reject 2 applications/i,
    );
  });

  it("words a single hire as a decision about one candidate", () => {
    const copy = hireConfirmationCopy(1);
    expect(copy.title).toBe("Hire this candidate?");
    expect(copy.action).toBe("Hire candidate");
    expect(copy.description).toMatch(/marked as hired/i);
  });

  it("states how many candidates a bulk hire affects", () => {
    const copy = hireConfirmationCopy(4);
    expect(copy.title).toBe("Hire 4 candidates?");
    expect(copy.action).toBe("Hire 4 candidates");
    expect(copy.description).toMatch(/all 4 selected applications/i);
  });
});
