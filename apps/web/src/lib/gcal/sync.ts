import "server-only";

import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db, interviews } from "@harly/db";

import {
  getWorkspaceGCalConfig,
  invalidateWorkspaceGCalConnection,
} from "@/lib/gcal/config";
import { getInterviewerGCalConfig, getPersonalGCalConfig, invalidatePersonalGCalConnection } from "./personal";
import type { GCalConfig } from "./config";
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
} from "@/lib/gcal/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("gcal-sync");

/**
 * Google Calendar event IDs are the idempotency key for interview creation.
 * Google only accepts base32hex characters (a-v and 0-9) for client IDs;
 * UUIDs and a human-readable `harly-` prefix are therefore not safe here.
 */
export function gcalEventIdForInterview(interviewId: string): string {
  return `harl${createHash("sha256").update(interviewId).digest("hex")}`;
}

type OwnedConfig = GCalConfig & { connectionId?: string };

/** Resolve persisted event ownership, not the current actor or default calendar. */
async function eventConfig(
  workspaceId: string,
  selector: { interviewId: string } | { eventId: string },
  interviewerId?: string | null,
): Promise<OwnedConfig | null> {
  const [interview] = await db.select().from(interviews).where(and(
    eq(interviews.workspaceId, workspaceId),
    "interviewId" in selector ? eq(interviews.id, selector.interviewId) : eq(interviews.gcalEventId, selector.eventId),
  )).limit(1);
  if (!interview) return null;
  if (interview.source === "cal.com-personal") return null;
  if (interview.gcalConnectionId) {
    const config = await getPersonalGCalConfig(workspaceId, { connectionId: interview.gcalConnectionId });
    return config ? { ...config, calendarId: interview.gcalCalendarId ?? config.calendarId } : null;
  }
  // Only events created before personal connections can use the legacy account.
  if (interview.gcalEventId) {
    const config = await getWorkspaceGCalConfig(workspaceId);
    return config ? { ...config, calendarId: interview.gcalCalendarId ?? config.calendarId } : null;
  }
  const config = await getInterviewerGCalConfig(workspaceId, interviewerId === undefined ? interview.interviewerId : interviewerId);
  if (!config) return null;
  // Pin before calling Google: even a timed-out creation must retry on the same calendar.
  const pinned = await db.update(interviews).set({
    gcalConnectionId: config.connectionId, gcalCalendarId: config.calendarId,
  }).where(and(
    eq(interviews.workspaceId, workspaceId), eq(interviews.id, interview.id),
    isNull(interviews.gcalConnectionId), isNull(interviews.gcalEventId),
  )).returning({ id: interviews.id });
  return pinned.length ? config : eventConfig(workspaceId, { interviewId: interview.id });
}

async function invalidateConfig(workspaceId: string, config: OwnedConfig | null) {
  if (config?.connectionId) await invalidatePersonalGCalConnection(workspaceId, config.connectionId);
  else if (config) await invalidateWorkspaceGCalConnection(workspaceId);
}

/**
 * Create a Google Calendar event for a new interview and store the event ID
 * back on the interview row. The database interview is the source of truth:
 * calendar failure is returned as a typed warning instead of rejecting the
 * already-created interview.
 */
export type GCalSyncResult =
  | { ok: true; eventId: string; meetLink?: string }
  | { ok: false; reason: "not_connected" | "invalid_grant" | "failed" };

export async function syncInterviewToGCal(opts: {
  workspaceId: string;
  interviewId: string;
  /** Used by the dashboard edit flow, whose provider sync precedes its DB update. */
  interviewerId?: string | null;
  summary: string;
  description?: string;
  start: Date;
  durationMins: number;
  attendees?: string[];
  location?: string;
  mode?: string;
  timeZone?: string;
}): Promise<GCalSyncResult> {
  let config: OwnedConfig | null = null;
  try {
    config = await eventConfig(opts.workspaceId, { interviewId: opts.interviewId }, opts.interviewerId);
    if (!config) return { ok: false, reason: "not_connected" };

    const eventId = gcalEventIdForInterview(opts.interviewId);
    let event;
    try {
      event = await createEvent(config.oauth2Client, config.calendarId, {
        id: eventId,
        summary: opts.summary,
        description: opts.description,
        start: opts.start,
        durationMins: opts.durationMins,
        attendees: opts.attendees,
        location: opts.location,
        conferenceData: opts.mode === "video",
        timeZone: opts.timeZone ?? "UTC",
      });
    } catch (error) {
      // A timeout can happen after Google committed the event but before Harly
      // persisted gcalEventId. Re-read the deterministic event instead of
      // creating a second invitation.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Google Calendar API 409")) throw error;
      event = await getEvent(config.oauth2Client, config.calendarId, eventId);
    }

    const update: Record<string, unknown> = { gcalEventId: event.id };
    if (event.hangoutLink) {
      update.meetLink = event.hangoutLink;
    }

    await db
      .update(interviews)
      .set(update)
      .where(
        and(
          eq(interviews.id, opts.interviewId),
          eq(interviews.workspaceId, opts.workspaceId),
        ),
      );
    return {
      ok: true,
      eventId: event.id,
      meetLink: event.hangoutLink,
    };
  } catch (err) {
    log.error(err, "[gcal-sync] Failed to create event");
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid_grant")) {
      await invalidateConfig(opts.workspaceId, config);
      return { ok: false, reason: "invalid_grant" };
    }
    return { ok: false, reason: "failed" };
  }
}

/**
 * Fire-and-forget: cancel or delete the GCal event when interview is canceled.
 */
export async function cancelInterviewGCalEvent(opts: {
  workspaceId: string;
  interviewId: string;
  gcalEventId: string;
}): Promise<boolean> {
  let config: OwnedConfig | null = null;
  try {
    config = await eventConfig(opts.workspaceId, { interviewId: opts.interviewId });
    if (!config) return false;

    await deleteEvent(config.oauth2Client, config.calendarId, opts.gcalEventId);

    await db
      .update(interviews)
      .set({ gcalEventId: null })
      .where(
        and(
          eq(interviews.id, opts.interviewId),
          eq(interviews.workspaceId, opts.workspaceId),
        ),
      );
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes("invalid_grant")) await invalidateConfig(opts.workspaceId, config);
    log.error(err, "[gcal-sync] Failed to cancel event");
    return false;
  }
}

/**
 * Fire-and-forget: update the GCal event when interview is rescheduled.
 */
export async function updateInterviewGCalEvent(opts: {
  workspaceId: string;
  gcalEventId: string;
  summary?: string;
  start?: Date;
  durationMins?: number;
  attendees?: string[];
  location?: string;
  status?: "confirmed" | "cancelled";
  timeZone?: string;
}): Promise<boolean> {
  let config: OwnedConfig | null = null;
  try {
    config = await eventConfig(opts.workspaceId, { eventId: opts.gcalEventId });
    if (!config) return false;

    await updateEvent(
      config.oauth2Client,
      config.calendarId,
      opts.gcalEventId,
      {
        summary: opts.summary,
        start: opts.start,
        durationMins: opts.durationMins,
        attendees: opts.attendees,
        location: opts.location,
        status: opts.status,
        timeZone: opts.timeZone ?? "UTC",
      },
    );
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes("invalid_grant")) await invalidateConfig(opts.workspaceId, config);
    log.error(err, "[gcal-sync] Failed to update event");
    return false;
  }
}
