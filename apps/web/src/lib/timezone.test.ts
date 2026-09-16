import { describe, expect, it } from "vitest";
import { greetingForTimeZone, isValidTimeZone } from "./timezone";
describe("localized dashboard greeting", () => {
  it("uses Manila morning when the same instant is evening in UTC", () => {
    const now = new Date("2026-09-15T23:00:00Z");
    expect(greetingForTimeZone(now, "Asia/Manila")).toBe("Good morning");
    expect(greetingForTimeZone(now, "UTC")).toBe("Good evening");
  });
  it.each([
    ["2026-09-16T04:00:00Z", "Good afternoon"],
    ["2026-09-16T10:00:00Z", "Good evening"],
    ["2026-09-16T16:00:00Z", "Good morning"],
  ])("handles local greeting boundaries at %s", (instant, expected) =>
    expect(greetingForTimeZone(new Date(instant), "Asia/Manila")).toBe(
      expected,
    ),
  );
  it("respects daylight saving instead of using a fixed UTC offset", () => {
    expect(
      greetingForTimeZone(new Date("2026-07-15T16:30:00Z"), "America/New_York"),
    ).toBe("Good afternoon");
    expect(
      greetingForTimeZone(new Date("2026-01-15T16:30:00Z"), "America/New_York"),
    ).toBe("Good morning");
  });
  it("handles legacy invalid timezone values without throwing", () => {
    expect(isValidTimeZone("Mars/Manila")).toBe(false);
    expect(greetingForTimeZone(new Date(), "Mars/Manila")).toBe("Hello");
  });
});
