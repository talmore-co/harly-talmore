import Link from "next/link";
import { CalendarClock, CalendarPlus, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { TodayInterview } from "@/features/dashboard/widgets";
import { googleCalendarEventHref, interviewCandidateHref } from "@/features/interviews/links";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

export function TodayInterviews({
  interviews,
  className,
  timeZone = "UTC",
  title = "Today's interviews",
  calendarMonth,
}: {
  interviews: TodayInterview[];
  className?: string;
  timeZone?: string;
  title?: string;
  calendarMonth?: string;
}) {
  const timeFmt = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone });
  return (
    <Tile className={className}>
      <TileHeader
        icon={CalendarClock}
        title={title}
        action={<TileLink href={calendarMonth ? `/dashboard/calendars?month=${calendarMonth}` : "/dashboard/calendars"}>View calendar</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-1">
        {interviews.length > 0 ? (
          <ul className="flex-1 space-y-0.5">
            {interviews.map((iv) => (
              <li
                key={iv.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              >
                <span className="w-16 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {timeFmt.format(new Date(iv.scheduledAt))}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={interviewCandidateHref(iv)} className="block truncate text-sm font-medium hover:underline" title={`View interviews for ${iv.candidate}`}>{iv.candidate}</Link>
                  <p className="truncate text-xs text-muted-foreground">{iv.job}</p>
                  {iv.interviewer ? (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserAvatar
                        name={iv.interviewer}
                        src={iv.interviewerImage}
                        size="sm"
                        className="size-5 text-[10px]"
                      />
                      {iv.interviewer}
                    </span>
                  ) : null}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {iv.label}
                </Badge>
                {iv.gcalEventId ? (
                  <a
                    href={googleCalendarEventHref(iv.gcalEventId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="View in Google Calendar"
                    aria-label={`View ${iv.candidate}'s interview in Google Calendar`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint icon={CalendarClock} text="No interviews scheduled for this day." />
        )}
        <Button asChild variant="outline" size="sm" className="mt-2 w-full">
          <Link href="/dashboard/pipeline">
            <CalendarPlus className="size-4" strokeWidth={1.8} />
            Schedule interview
          </Link>
        </Button>
      </div>
    </Tile>
  );
}
