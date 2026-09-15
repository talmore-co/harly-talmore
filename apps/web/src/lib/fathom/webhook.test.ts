import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  fathomMeetingSchema,
  matchFathomInterview,
  meetingIdentity,
  verifyFathomSignature,
  type FathomMeeting,
} from "./webhook";

const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const now = Date.parse("2026-09-15T12:00:00Z");
const raw = '{"recording_id":123}';
function headers(timestamp = String(now / 1000)) {
  return new Headers({
    "webhook-id": "msg_fictional",
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${createHmac("sha256", Buffer.alloc(32, 7)).update(`msg_fictional.${timestamp}.${raw}`).digest("base64")}`,
  });
}
describe("Fathom webhook signatures", () => {
  it("accepts a valid signature among rotated signatures", () => {
    const h = headers();
    h.set("webhook-signature", `v1,bad ${h.get("webhook-signature")}`);
    expect(verifyFathomSignature(raw, h, secret, now)).toBe(true);
  });
  it("rejects tampered bodies and short signatures without throwing", () => {
    expect(verifyFathomSignature(raw + " ", headers(), secret, now)).toBe(
      false,
    );
    const h = headers();
    h.set("webhook-signature", "v1,x");
    expect(verifyFathomSignature(raw, h, secret, now)).toBe(false);
  });
  it.each(["0", String(now / 1000 + 301), "NaN", "123abc"])(
    "rejects stale/future/malformed timestamp %s",
    (timestamp) => {
      expect(verifyFathomSignature(raw, headers(timestamp), secret, now)).toBe(
        false,
      );
    },
  );
  it("rejects missing headers and invalid secrets", () => {
    expect(verifyFathomSignature(raw, new Headers(), secret, now)).toBe(false);
    expect(verifyFathomSignature(raw, headers(), "whsec_x", now)).toBe(false);
  });
});

const meeting: FathomMeeting = {
  recording_id: 123,
  url: "https://fathom.video/calls/123",
  meeting_url: "https://meet.google.com/abc-defg-hij?authuser=1",
  scheduled_start_time: "2026-09-15T12:00:00Z",
  recorded_by: { email: "recruiter@example.test" },
  calendar_invitees: [{ email: "candidate@example.test" }],
};
const row = {
  id: "interview",
  meetLink: "https://meet.google.com/abc-defg-hij",
  location: null,
  scheduledAt: new Date(now),
  candidateEmail: "candidate@example.test",
};
describe("conservative Fathom matching", () => {
  it("matches a unique scheduled interview with the same participant and recorder", () => {
    expect(matchFathomInterview(meeting, "RECRUITER@example.test", [row])).toBe(
      row.id,
    );
  });
  it("ignores unrelated meetings, other recruiters and missing candidates", () => {
    expect(
      matchFathomInterview(meeting, "other@example.test", [row]),
    ).toBeNull();
    expect(
      matchFathomInterview(meeting, "recruiter@example.test", [
        { ...row, candidateEmail: "other@example.test" },
      ]),
    ).toBeNull();
    expect(
      matchFathomInterview(
        { ...meeting, meeting_url: null },
        "recruiter@example.test",
        [row],
      ),
    ).toBeNull();
  });
  it("ignores ambiguous interviews and recurring rooms on a different date", () => {
    expect(
      matchFathomInterview(meeting, "recruiter@example.test", [
        row,
        { ...row, id: "second" },
      ]),
    ).toBeNull();
    expect(
      matchFathomInterview(meeting, "recruiter@example.test", [
        { ...row, scheduledAt: new Date(now + 86400000) },
      ]),
    ).toBeNull();
  });
  it("normalizes Zoom hosts and passwords but not distinct meeting IDs", () => {
    expect(meetingIdentity("https://us02web.zoom.us/j/123?pwd=fictional")).toBe(
      meetingIdentity("https://zoom.us/j/123"),
    );
    expect(meetingIdentity("https://zoom.us/j/123")).not.toBe(
      meetingIdentity("https://zoom.us/j/456"),
    );
    expect(meetingIdentity("https://zoom.us.attacker.test/j/123")).not.toBe(
      meetingIdentity("https://zoom.us/j/123"),
    );
  });
  it("preserves identity-bearing parameters for unknown providers", () => {
    expect(meetingIdentity("https://example.test/meet?id=1")).not.toBe(
      meetingIdentity("https://example.test/meet?id=2"),
    );
    expect(meetingIdentity("javascript:alert(1)")).toBeNull();
  });
  it("rejects unsafe recording links", () => {
    expect(
      fathomMeetingSchema.safeParse({
        ...meeting,
        url: "https://fathom.video.attacker.test/calls/123",
      }).success,
    ).toBe(false);
    expect(
      fathomMeetingSchema.safeParse({ ...meeting, url: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
});
