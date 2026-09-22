import { describe, expect, it } from "vitest";
import { importProfile, normalizedLinkedIn } from "./profile";
import type { ExportedCandidate } from "./client";

describe("sourced candidate profiles", () => {
  const profile: ExportedCandidate = { candidateId: "source-id", organizationId: "org", profile: { fullName: "Fictional Prospect" }, contacts: {}, privateContext: {} };
  it("keeps absent email null and permits a one-part name", () => {
    expect(importProfile({ ...profile, profile: { fullName: "Fictional" } })).toMatchObject({ firstName: "Fictional", lastName: "", email: null });
    expect(importProfile({ ...profile, profile: { fullName: "Fictional Prospect", firstName: "Fictional" } })).toMatchObject({ firstName: "Fictional", lastName: "Prospect" });
  });
  it("rejects invalid emails and unnamed candidates", () => {
    expect(() => importProfile({ ...profile, contacts: { selectedEmail: "not-an-email" } })).toThrow("invalid");
    expect(() => importProfile({ ...profile, profile: {} })).toThrow("no name");
  });
  it("normalizes profile identity without matching lookalike domains", () => {
    expect(normalizedLinkedIn("https://uk.linkedin.com/in/Example/?trk=test")).toBe("https://www.linkedin.com/in/example");
    expect(normalizedLinkedIn("https://linkedin.com.example.test/in/example")).toBeNull();
  });
});
