import { describe, expect, it } from "vitest";
import { attributionCsv, matchesAttribution } from "./AttributionControls";
import { captureAttribution } from "@/features/applications/attribution";
import type { PipelineApplication } from "./data";

describe("pipeline attribution reporting", () => {
  const attribution = captureAttribution(
    new URL(
      "https://ats.example.test/jobs/test?utm_campaign=Robotics&ad_id=456&utm_content=%3DHYPERLINK%28%22bad%22%29",
    ),
    "test",
    null,
  );
  it("filters saved historical attribution by label or ad ID", () => {
    expect(matchesAttribution(attribution, "robotics")).toBe(true);
    expect(matchesAttribution(attribution, "456")).toBe(true);
    expect(matchesAttribution(attribution, "missing")).toBe(false);
    expect(matchesAttribution(null, "")).toBe(true);
    expect(matchesAttribution(null, "robotics")).toBe(false);
  });
  it("exports score and attribution snapshots with spreadsheet formula protection", () => {
    const app = {
      id: "application",
      candidateFirstName: "=1+1",
      candidateLastName: "Test",
      jobTitle: "Fictional job",
      status: "active",
      questionnaireScore: 75,
      aiScore: 60,
      attribution,
    } as PipelineApplication;
    const csv = attributionCsv([app]);
    expect(csv).toContain('"first_ad_id"');
    expect(csv).toContain('"75","60"');
    expect(csv).toContain('"\'=1+1 Test"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  });
});
