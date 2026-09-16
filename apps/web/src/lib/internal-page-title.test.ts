import { describe, expect, it } from "vitest";
import { internalPageTitle } from "./internal-page-title";
describe("internal page titles", () => {
  it("names internal routes without exposing IDs", () => {
    expect(internalPageTitle("/dashboard")).toBe("Home");
    expect(internalPageTitle("/dashboard/pipeline")).toBe("Pipeline");
    expect(internalPageTitle("/dashboard/jobs/fictional-id")).toBe(
      "Job details",
    );
    expect(internalPageTitle("/dashboard/jobs/new")).toBe("Create job");
    expect(internalPageTitle("/dashboard/candidates/fictional-id")).toBe(
      "Candidate profile",
    );
    expect(internalPageTitle("/settings/integrations/meta")).toBe(
      "Integrations",
    );
  });
  it("leaves public job metadata independent", () => {
    expect(internalPageTitle("/board/talmore/jobs/role")).toBeNull();
    expect(internalPageTitle("/jobs/role")).toBeNull();
    expect(internalPageTitle(null)).toBeNull();
  });
});
