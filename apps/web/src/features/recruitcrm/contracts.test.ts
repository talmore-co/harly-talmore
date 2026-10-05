import { describe, expect, it } from "vitest";
import { candidateSchema, restrictions } from "./contracts";
import { contactRestriction } from "@/features/candidates/contact-restrictions";

describe("Recruit CRM contact restrictions", () => {
  it("handles string flags and zero-valued off-limit IDs", () => {
    const profile = candidateSchema.parse({ slug: "fictional", is_email_opted_out: "false", off_limit_status_id: "0" });
    expect(restrictions(profile)).toMatchObject({ emailOptedOut: false, contactOffLimits: false, contactOffLimitsUntil: null });
    expect(restrictions(candidateSchema.parse({ ...profile, is_email_opted_out: "true" })).emailOptedOut).toBe(true);
    expect(restrictions(candidateSchema.parse({ ...profile, status_label: "Available" })).contactRestrictionReason).toBeNull();
  });
  it("expires a dated off-limit restriction but keeps email opt-outs", () => {
    const row = { emailOptedOut: false, contactOffLimits: true, contactOffLimitsUntil: new Date("2026-01-01T00:00:00Z") };
    expect(contactRestriction(row, new Date("2025-12-31T23:59:00Z"))).toContain("off limits");
    expect(contactRestriction(row, new Date("2026-01-02T00:00:00Z"))).toBeNull();
    expect(contactRestriction({ ...row, emailOptedOut: true }, new Date("2026-01-02T00:00:00Z"))).toContain("opted out");
    expect(contactRestriction({ ...row, contactOffLimitsUntil: null })).toContain("off limits");
  });
  it("lets an email opt-out through for non-email contact, but never off limits", () => {
    const optedOut = { emailOptedOut: true, contactOffLimits: false, contactOffLimitsUntil: null };
    expect(contactRestriction(optedOut, new Date(), "contact")).toBeNull();
    expect(contactRestriction({ ...optedOut, contactOffLimits: true }, new Date(), "contact")).toContain("off limits");
  });
  it("treats a status label as off limits only when it says so", () => {
    const profile = candidateSchema.parse({ slug: "fictional", off_limit_status_id: "0" });
    expect(restrictions({ ...profile, status_label: "Placed" }).contactOffLimits).toBe(false);
    expect(restrictions({ ...profile, status_label: "Not Off Limit" }).contactOffLimits).toBe(false);
    expect(restrictions({ ...profile, status_label: "Off Limit" })).toMatchObject({ contactOffLimits: true, contactRestrictionReason: "Off Limit" });
  });
});
