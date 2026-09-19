import { describe, it, expect } from "vitest";
import { dashboardDay, dashboardTimeZone, validDashboardDay } from "./day";

describe("dashboard day", () => {
  it("uses recruiter midnight instead of server midnight", () => {
    const instant = new Date("2026-09-18T18:00:00Z");
    expect(dashboardDay("Asia/Manila", instant)).toBe("2026-09-19");
    expect(dashboardDay("America/Los_Angeles", instant)).toBe("2026-09-18");
  });
  it("validates saved timezones and calendar dates", () => {
    expect(dashboardTimeZone("not-a-zone")).toBe("UTC");
    expect(dashboardTimeZone(null)).toBe("UTC");
    expect(validDashboardDay("2026-02-30")).toBe(false);
    expect(validDashboardDay("0000-01-01")).toBe(false);
    expect(validDashboardDay("2028-02-29")).toBe(true);
  });
});
