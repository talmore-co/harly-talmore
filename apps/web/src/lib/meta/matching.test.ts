import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashedMetaContact } from "./matching";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe("Meta contact matching", () => {
  it("normalizes email and international phone before hashing", () => {
    expect(hashedMetaContact({ email: " Person@Example.COM ", phone: "+63 (917) 123-4567" })).toEqual({
      em: [digest("person@example.com")], ph: [digest("639171234567")],
    });
  });
  it("does not guess a country code or hash invalid and missing phone values", () => {
    for (const phone of [undefined, null, "", "09171234567", "+00123", "+63ABC1234567", "+1 234 ext 56"]) {
      expect(hashedMetaContact({ phone })).toEqual({});
    }
    expect(hashedMetaContact({ email: "  " })).toEqual({});
  });
  it("preserves email aliases rather than changing the applicant identity", () => {
    expect(hashedMetaContact({ email: "First.Last+jobs@example.com" }).em).toEqual([digest("first.last+jobs@example.com")]);
  });
});
