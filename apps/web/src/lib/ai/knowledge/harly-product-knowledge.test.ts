import { describe, expect, it } from "vitest";

import {
  HARLY_PRODUCT_KNOWLEDGE,
  getHarlyCoreProductContext,
  searchHarlyProductKnowledge,
} from "./harly-product-knowledge";

describe("Harly product knowledge", () => {
  it("retrieves stable product rules without workspace data", () => {
    const results = searchHarlyProductKnowledge("publicar puesto LinkedIn");
    expect(results[0]?.id).toBe("job-publication-and-sharing");
    expect(results[0]?.content).toContain("native LinkedIn Job");
  });

  it("keeps entries versioned and bounded", () => {
    expect(HARLY_PRODUCT_KNOWLEDGE.length).toBeGreaterThanOrEqual(15);
    for (const entry of HARLY_PRODUCT_KNOWLEDGE) {
      expect(entry.version).toMatch(/^\d+\.\d+$/);
      expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.content.length).toBeLessThan(1200);
    }
  });

  it("provides always-on identity and hard boundaries", () => {
    const context = getHarlyCoreProductContext();
    expect(context).toContain(
      "Talmore ATS is the recruitment agency's applicant tracking system",
    );
    expect(context).toContain("does not make final hiring decisions");
    expect(context).toContain(
      "does not have native LinkedIn Jobs publishing",
    );
  });
});
