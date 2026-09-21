import { describe, expect, it } from "vitest";
import { messageSenderLabel } from "./message-sender";

describe("email sender attribution", () => {
  const base = { direction: "outbound" as const, fromEmail: "shared@example.test", authorName: null };
  it("uses the actual author instead of the viewer", () => {
    expect(messageSenderLabel({ ...base, origin: "member", authorName: "Edmon" })).toBe("Sent by Edmon");
  });
  it("keeps automated origin even when an actor is recorded", () => {
    expect(messageSenderLabel({ ...base, origin: "system", authorName: "Edmon" })).toBe("System email · triggered by Edmon");
    expect(messageSenderLabel({ ...base, origin: "automation", authorName: "Edmon" })).toContain("Automation");
  });
  it("does not infer a member from a shared sender address", () => {
    expect(messageSenderLabel(base)).toBe("Sender not recorded");
    expect(messageSenderLabel({ ...base, direction: "inbound" })).toBe(base.fromEmail);
  });
});
