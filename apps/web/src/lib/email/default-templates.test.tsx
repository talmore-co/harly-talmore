import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ApplicationReceivedCandidate, CandidateRejected, InterviewCanceled, InterviewScheduled, InterviewRescheduled, OfferExtended, OfferWithdrawn, PortalMagicLinkEmail, buildCalendarLinks, buildInterviewCalendar } from "@harly/emails";
import { interviewEmailDetails } from "./interview-details";

const localRequire = createRequire(import.meta.url);
const { render } = createRequire(localRequire.resolve("@harly/emails"))("@react-email/render") as { render: (element: React.ReactElement) => Promise<string> };
const common = { candidateName: "Ava", companyName: "Talmore", jobTitle: "Test role" };

describe("candidate email defaults", () => {
  it("uses the selected timezone and separates date from time", () => {
    const details = interviewEmailDetails(new Date("2026-09-17T07:00:00Z"), "Asia/Manila");
    expect(details.date).toBe("Thursday, 17 September 2026");
    expect(details.time).toMatch(/3:00.*pm.*GMT\+08:00.*Asia\/Manila/i);
    expect(details.time).not.toContain("September");
    expect(interviewEmailDetails(new Date("2026-09-17T07:00:00Z"), "invalid").when).toContain("UTC");
    expect(interviewEmailDetails(new Date("2026-07-17T07:00:00Z"), "Europe/Berlin").time).toContain("GMT+02:00");
    expect(interviewEmailDetails(new Date("2026-01-17T07:00:00Z"), "Europe/Berlin").time).toContain("GMT+01:00");
  });

  it("preserves UTC instants and stable identities in calendar files", () => {
    const details = { summary: "Test, interview", start: new Date("2026-09-17T07:00:00Z"), durationMins: 30, uid: "interview-1@talmore", updatedAt: new Date("2026-09-16T08:00:00Z"), description: "Notes\n" + "é".repeat(100) };
    const link = new URL(buildCalendarLinks(details).googleCalendarUrl);
    expect(link.searchParams.get("dates")).toBe("20260917T070000Z/20260917T073000Z");
    const original = buildInterviewCalendar(details);
    const updated = buildInterviewCalendar({ ...details, start: new Date("2026-09-18T07:00:00Z"), updatedAt: new Date("2026-09-17T08:00:00Z") });
    expect(original).toContain("UID:interview-1@talmore");
    expect(updated).toContain("UID:interview-1@talmore");
    expect(original).toContain("SUMMARY:Test\\, interview");
    expect(original.split("\r\n").every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(updated).not.toContain(original.match(/SEQUENCE:\d+/)![0]);
  });

  it("renders candidate messages without vendor branding or unfounded promises", async () => {
    const messages = [
      <ApplicationReceivedCandidate key="received" {...common} />, <CandidateRejected key="rejected" {...common} />,
      <InterviewCanceled key="canceled" {...common} interviewType="Interview" />,
      <OfferExtended key="offer" {...common} offerUrl="https://example.test/offer" />,
      <OfferWithdrawn key="withdrawn" {...common} reason="The position has closed." />,
      <PortalMagicLinkEmail key="login" loginUrl="https://example.test/login" branding={{ name: "Talmore" }} />,
    ];
    const html = (await Promise.all(messages.map(message => render(message)))).join("\n");
    expect(html).not.toMatch(/Powered by|cdn\.harly\.dev|keep your profile on file|find a new time that works|attached offer letter/);
    expect(html).toContain("has been withdrawn");
    expect(html).toContain("The position has closed.");
    expect(html).not.toContain("join Talmore as");
  });

  it("renders meeting links, attachments guidance and a readable workspace accent", async () => {
    const props = { ...common, interviewType: "Interview", when: "17 September, 3 PM GMT+8", mode: "Video call", location: "https://meet.example.test/room", startIso: "2026-09-17T07:00:00Z", durationMins: 30, accentColor: "#ccff00" };
    const html = await render(<InterviewScheduled {...props} />);
    expect(html).toContain('href="https://meet.example.test/room"');
    expect(html).toContain("Join interview");
    expect(html).not.toContain("data:text/calendar");
    expect(html).toContain("calendar file is attached");
    expect(html).toMatch(/background-color:\s*(#ccff00|rgb\(204,\s*255,\s*0\))/i);
    const rescheduled = await render(<InterviewRescheduled {...props} />);
    expect(rescheduled).not.toContain("calendar.google.com/calendar/render");
    expect(rescheduled).toContain("Updated calendar details are attached");
  });
});
