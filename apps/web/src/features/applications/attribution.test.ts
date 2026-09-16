import { describe, expect, it } from "vitest";
import {
  captureAttribution,
  parseAttribution,
  ATTRIBUTION_MAX_AGE,
} from "./attribution";

const now = Date.parse("2026-09-16T10:00:00Z");
const url = (query = "") =>
  new URL(`https://ats.example.test/board/fictional/jobs/test${query}`);
describe("application attribution", () => {
  it("captures allowlisted parameters without storing arbitrary query data", () => {
    const data = captureAttribution(
      url(
        "?utm_source=facebook&utm_campaign=Robotics&ad_id=123&email=private%40example.test&fbclid=click",
      ),
      "workspace",
      null,
      now,
    );
    expect(data?.first).toEqual({
      utm_source: "facebook",
      utm_campaign: "Robotics",
      ad_id: "123",
      landingPath: "/board/fictional/jobs/test",
      capturedAt: "2026-09-16T10:00:00.000Z",
    });
    expect(data?.first).toEqual(data?.last);
  });
  it("preserves first touch and updates last touch only on a new tagged visit", () => {
    const first = captureAttribution(
      url("?utm_source=facebook&ad_id=1"),
      "workspace",
      null,
      now,
    );
    const internal = captureAttribution(url(), "workspace", first, now + 1000);
    expect(internal).toEqual(first);
    expect(
      captureAttribution(
        url("?utm_source=facebook&ad_id=1"),
        "workspace",
        first,
        now + 1000,
      ),
    ).toEqual(first);
    const last = captureAttribution(
      url("?utm_source=instagram&ad_id=2"),
      "workspace",
      first,
      now + 2000,
    );
    expect(last?.first).toEqual(first?.first);
    expect(last?.last.ad_id).toBe("2");
  });
  it("isolates workspaces and expires browser attribution after 30 days", () => {
    const first = captureAttribution(
      url("?utm_source=facebook"),
      "a",
      null,
      now,
    );
    expect(captureAttribution(url(), "b", first, now)).toBeNull();
    expect(parseAttribution(first, now + ATTRIBUTION_MAX_AGE + 1)).toBeNull();
  });
  it("ignores malformed, oversized or future snapshots", () => {
    expect(parseAttribution("bad json", now)).toBeNull();
    expect(parseAttribution("x".repeat(12001), now)).toBeNull();
    expect(
      captureAttribution(
        url(`?utm_campaign=${"a".repeat(201)}`),
        "w",
        null,
        now,
      ),
    ).toBeNull();
    const future = captureAttribution(
      url("?utm_source=x"),
      "w",
      null,
      now + 120000,
    );
    expect(parseAttribution(future, now)).toBeNull();
  });
});
