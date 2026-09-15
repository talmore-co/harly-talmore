"use server";

import { and, eq, gt, lt, ne } from "drizzle-orm";

import { db, interviews } from "@harly/db";
import { getInterviewerGCalConfig } from "@/lib/gcal/personal";
import { getFreeBusy } from "@/lib/gcal/client";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requireInterviewPermission, requirePermission } from "@/features/workspaces/permissions-server";
import { z } from "zod";

type AvailabilityResult = {
  gcalBusy: Array<{ start: string; end: string }>;
  internalConflicts: Array<{
    interviewId: string;
    title: string | null;
    scheduledAt: string;
    durationMins: number;
  }>;
  error?: string;
};

/**
 * Check availability from two sources:
 * 1. Google Calendar free/busy (external events)
 * 2. Internal interview overlaps (same interviewer, same time)
 *
 * Optionally filter by interviewerId to check a specific person's conflicts.
 */
export async function checkAvailability(opts: {
  timeMin: Date;
  timeMax: Date;
  interviewerId?: string;
  excludeInterviewId?: string;
}): Promise<AvailabilityResult> {
  try {
    const { organization: workspace } = await getWorkspaceContext();
    const parsed = z.object({ timeMin: z.date(), timeMax: z.date(), interviewerId: z.string().optional(), excludeInterviewId: z.string().uuid().optional() }).safeParse(opts);
    if (!parsed.success || opts.timeMax <= opts.timeMin || opts.timeMax.getTime() - opts.timeMin.getTime() > 7 * 86400000) {
      return { gcalBusy: [], internalConflicts: [], error: "Choose a valid availability window of up to seven days." };
    }
    let interviewerId = opts.interviewerId;
    if (opts.excludeInterviewId) {
      await requireInterviewPermission("collab:write", opts.excludeInterviewId);
      if (!interviewerId) {
        const [interview] = await db.select({ interviewerId: interviews.interviewerId }).from(interviews)
          .where(and(eq(interviews.id, opts.excludeInterviewId), eq(interviews.workspaceId, workspace.id))).limit(1);
        interviewerId = interview?.interviewerId ?? undefined;
      }
    } else {
      await requirePermission("collab:write");
    }

    // 1. GCal free/busy
    let gcalBusy: Array<{ start: string; end: string }> = [];
    let error: string | undefined;
    const config = await getInterviewerGCalConfig(workspace.id, interviewerId);
    if (config) {
      try {
        gcalBusy = (await Promise.all(config.availabilityCalendarIds.map((calendarId) => getFreeBusy(
          config.oauth2Client,
          calendarId,
          opts.timeMin,
          opts.timeMax,
        )))).flat();
      } catch {
        error = "Could not check the interviewer's Google Calendar. Confirm availability before scheduling.";
      }
    } else {
      error = interviewerId
        ? "This interviewer has not connected Google Calendar. Calendar availability and automatic Meet creation are unavailable."
        : "Select an interviewer to check their calendar.";
    }

    // 2. Internal interview conflicts (same interviewer overlap)
    let internalConflicts: AvailabilityResult["internalConflicts"] = [];
    if (interviewerId) {
      const conditions = [
        eq(interviews.workspaceId, workspace.id),
        eq(interviews.interviewerId, interviewerId),
        eq(interviews.status, "scheduled"),
        lt(interviews.scheduledAt, opts.timeMax),
        gt(
          // scheduledAt + durationMins > timeMin
          // We approximate by comparing scheduledAt + 480min max as upper bound
          // and use the DB-level check below.
          interviews.scheduledAt,
          new Date(opts.timeMin.getTime() - 480 * 60_000),
        ),
      ];

      if (opts.excludeInterviewId) {
        conditions.push(ne(interviews.id, opts.excludeInterviewId));
      }

      const overlapping = await db
        .select({
          id: interviews.id,
          title: interviews.title,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
        })
        .from(interviews)
        .where(and(...conditions));

      // Precise overlap check in JS (DB can't do scheduledAt + durationMins easily).
      internalConflicts = overlapping.filter((iv) => {
        const ivStart = new Date(iv.scheduledAt).getTime();
        const ivEnd = ivStart + iv.durationMins * 60_000;
        const reqStart = opts.timeMin.getTime();
        const reqEnd = opts.timeMax.getTime();
        return ivStart < reqEnd && ivEnd > reqStart;
      }).map((iv) => ({
        interviewId: iv.id,
        title: iv.title,
        scheduledAt: iv.scheduledAt.toISOString(),
        durationMins: iv.durationMins,
      }));
    }

    return { gcalBusy, internalConflicts, error };
  } catch {
    return { gcalBusy: [], internalConflicts: [], error: "Could not check availability." };
  }
}
