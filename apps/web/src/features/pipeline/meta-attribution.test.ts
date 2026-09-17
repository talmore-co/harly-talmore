import { describe, expect, it } from "vitest";
import { metaAdAttribution } from "./meta-attribution";

const touch = { capturedAt: "2025-01-01T12:00:00.000Z", landingPath: "/jobs/test", utm_source: "fb", utm_medium: "paid_social", ad_id: "123" };
const snapshot = { version: 1, workspaceId: "test", first: touch, last: touch };

describe("Meta attribution badge eligibility", () => {
  it("recognizes saved Meta ad visits even after the browser retention window", () => {
    expect(metaAdAttribution(snapshot)).not.toBeNull();
    expect(metaAdAttribution({ ...snapshot, first: { ...touch, utm_source: "ig" } })).not.toBeNull();
  });
  it("does not classify organic Meta traffic, Google ads, or conversion delivery as Meta ad visits", () => {
    for (const visit of [{ ...touch, utm_medium: "organic", ad_id: undefined }, { ...touch, utm_source: "google" }]) {
      expect(metaAdAttribution({ ...snapshot, first: visit, last: visit })).toBeNull();
    }
    expect(metaAdAttribution({ source: "public_form", event: "QualifiedApplication" })).toBeNull();
    expect(metaAdAttribution(null)).toBeNull();
  });
  it("retains both visits when only the first came from Meta", () => {
    const value = { ...snapshot, last: { ...touch, utm_source: "newsletter" } };
    expect(metaAdAttribution(value)?.last.utm_source).toBe("newsletter");
  });
});
