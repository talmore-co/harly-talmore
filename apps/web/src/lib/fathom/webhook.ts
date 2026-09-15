import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const fathomSecretSchema = z
  .string()
  .trim()
  .max(1000)
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => Buffer.from(value.slice(6), "base64").length >= 16);

export function verifyFathomSignature(
  raw: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (
    !id ||
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    !signatures ||
    !fathomSecretSchema.safeParse(secret).success
  )
    return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${raw}`)
    .digest();
  return signatures.split(" ").some((signature) => {
    const [version, encoded] = signature.split(",");
    if (version !== "v1" || !encoded) return false;
    const actual = Buffer.from(encoded, "base64");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}

export const fathomMeetingSchema = z.object({
  recording_id: z.number().int().positive().safe(),
  url: z
    .string()
    .url()
    .max(2000)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname === "fathom.video" &&
        !url.username &&
        !url.password &&
        !url.port
      );
    }),
  meeting_url: z.string().max(4000).nullish(),
  scheduled_start_time: z.string().datetime({ offset: true }).nullish(),
  recorded_by: z.object({ email: z.string().email().max(320) }),
  calendar_invitees: z
    .array(z.object({ email: z.string().max(320).nullable() }))
    .max(500),
  default_summary: z
    .object({ markdown_formatted: z.string().max(250_000).nullish() })
    .nullish(),
  transcript: z
    .array(
      z.object({
        speaker: z.object({ display_name: z.string().max(500) }),
        text: z.string().max(50_000),
        timestamp: z.string().regex(/^\d{2,3}:\d{2}:\d{2}$/),
      }),
    )
    .max(20_000)
    .nullish(),
});
export type FathomMeeting = z.infer<typeof fathomMeetingSchema>;

/** Normalize only known provider tracking/auth parameters, never arbitrary room IDs. */
export function meetingIdentity(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const path = url.pathname.replace(/\/$/, "");
    if (
      url.hostname === "meet.google.com" &&
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(path)
    )
      return `google:${path}`;
    if (
      (url.hostname === "zoom.us" || url.hostname.endsWith(".zoom.us")) &&
      /^\/j\/\d+$/.test(path)
    )
      return `zoom:${path}`;
    if (
      ["teams.microsoft.com", "teams.live.com"].includes(url.hostname) &&
      path.startsWith("/l/meetup-join/")
    )
      return `${url.hostname}:${path}`;
    // Other providers must match the entire URL, including query parameters.
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export const MATCH_WINDOW_MS = 5 * 60 * 1000;
export function matchFathomInterview(
  meeting: FathomMeeting,
  recorderEmail: string | null,
  rows: Array<{
    id: string;
    meetLink: string | null;
    location: string | null;
    scheduledAt: Date;
    candidateEmail: string | null;
  }>,
) {
  const identity = meetingIdentity(meeting.meeting_url);
  if (
    !identity ||
    !meeting.scheduled_start_time ||
    (recorderEmail !== null &&
      meeting.recorded_by.email.toLowerCase() !== recorderEmail.toLowerCase())
  )
    return null;
  const time = new Date(meeting.scheduled_start_time).getTime();
  const invitees = new Set(
    meeting.calendar_invitees.map((invitee) => invitee.email?.toLowerCase()),
  );
  const matches = rows.filter(
    (row) =>
      Math.abs(row.scheduledAt.getTime() - time) <= MATCH_WINDOW_MS &&
      Boolean(
        row.candidateEmail && invitees.has(row.candidateEmail.toLowerCase()),
      ) &&
      (identity === meetingIdentity(row.meetLink) ||
        identity === meetingIdentity(row.location)),
  );
  return matches.length === 1 ? matches[0].id : null;
}
