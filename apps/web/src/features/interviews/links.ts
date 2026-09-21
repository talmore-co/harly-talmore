import type { Route } from "next";

export function interviewCandidateHref(interview: { candidateId: string; applicationId: string }): Route {
  const params = new URLSearchParams({ tab: "interviews", applicationId: interview.applicationId });
  return `/dashboard/candidates/${interview.candidateId}?${params}` as Route;
}

export function googleCalendarEventHref(eventId: string): string {
  return `https://calendar.google.com/calendar/r/search?q=${encodeURIComponent(eventId)}`;
}
