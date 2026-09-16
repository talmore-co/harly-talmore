/** Dates shown to candidates must never depend on the server's local timezone. */
export function interviewEmailDetails(when: Date, requestedTimeZone?: string) {
  let timeZone = requestedTimeZone || "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone }).format(when); }
  catch { timeZone = "UTC"; }
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(when);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "longOffset", timeZone }).format(when);
  return { date, time: `${time} (${timeZone})`, when: `${date} at ${time} (${timeZone})` };
}
