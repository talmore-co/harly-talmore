import { AssistantPortrait } from "@/features/account/AssistantPersona";
import { GreetingSalutation } from "./GreetingSalutation";

/**
 * Home's identity moment (DESIGN.md , Morning Greeting Header).
 *
 * Avatar + "Good morning, {First}!" at greeting scale, and one short
 * operational subline. Deliberately not the old header: no waving emoji, no
 * "Let's go!", no date stamp in the corner competing for the eye. In a
 * GDPR-ready hiring tool that tone reads as a toy , and the frame's greeting is
 * a single calm line.
 */
export function GreetingHeader({
  name,
  timeZone,
  initialNow,
  subline,
}: {
  name: string;
  timeZone: string | null;
  initialNow: string;
  subline: string;
}) {
  return (
    <header className="flex items-center gap-3 pt-4">
      <AssistantPortrait size={48} />
      <div className="min-w-0">
        <h1 className="font-display truncate text-[24px] leading-tight text-near-ink">
          <GreetingSalutation timeZone={timeZone} initialNow={initialNow} />, {name}!
        </h1>
        <p className="mt-0.5 text-[13px] text-soft-ink">{subline}</p>
      </div>
    </header>
  );
}

/**
 * Operational, countable, and never cheerful about an empty pipeline. Reads the
 * two numbers a recruiter is actually deciding on at 9:12am.
 */
export function buildSubline({
  waiting,
  replies,
  interviewsToday,
}: {
  waiting: number;
  replies: number;
  interviewsToday: number;
}) {
  const parts: string[] = [];

  if (waiting > 0) {
    parts.push(
      `${waiting} new ${waiting === 1 ? "application" : "applications"}`,
    );
  }
  if (replies > 0) {
    parts.push(`${replies} ${replies === 1 ? "conversation needs" : "conversations need"} a reply`);
  }
  if (interviewsToday > 0) {
    parts.push(
      `${interviewsToday} ${interviewsToday === 1 ? "interview" : "interviews"} today`,
    );
  }

  if (parts.length === 0) return "No new applications, conversations needing a reply, or interviews today.";
  return `${parts.join(" · ")}.`;
}
