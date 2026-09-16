type CalendarDetails = {
  summary: string;
  start: Date;
  durationMins: number;
  description?: string;
  location?: string;
};

function calendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function endDate(opts: CalendarDetails) {
  if (!Number.isFinite(opts.durationMins) || opts.durationMins <= 0) throw new Error("Invalid calendar duration");
  return new Date(opts.start.getTime() + opts.durationMins * 60_000);
}

export function buildCalendarLinks(opts: CalendarDetails) {
  const params = new URLSearchParams({ action: "TEMPLATE", text: opts.summary,
    dates: `${calendarDate(opts.start)}/${calendarDate(endDate(opts))}` });
  if (opts.description) params.set("details", opts.description);
  if (opts.location) params.set("location", opts.location);
  return { googleCalendarUrl: `https://calendar.google.com/calendar/render?${params}` };
}

/** Fold at 75 UTF-8 octets without splitting a character (RFC 5545). */
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { result += "\r\n "; bytes = 1; }
    result += character;
    bytes += size;
  }
  return result;
}

/** A real attachment. Stable UID lets compatible clients update an imported event. */
export function buildInterviewCalendar(opts: CalendarDetails & {
  uid: string;
  updatedAt: Date;
}) {
  if (!/^[A-Za-z0-9@._-]+$/.test(opts.uid)) throw new Error("Invalid calendar identity");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Talmore//Interviews//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${opts.uid}`, `DTSTAMP:${calendarDate(opts.updatedAt)}`,
    `LAST-MODIFIED:${calendarDate(opts.updatedAt)}`, `SEQUENCE:${Math.floor(opts.updatedAt.getTime() / 1000)}`,
    `DTSTART:${calendarDate(opts.start)}`, `DTEND:${calendarDate(endDate(opts))}`,
    "STATUS:CONFIRMED", `SUMMARY:${escapeText(opts.summary)}`,
    ...(opts.description ? [`DESCRIPTION:${escapeText(opts.description)}`] : []),
    ...(opts.location ? [`LOCATION:${escapeText(opts.location)}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
