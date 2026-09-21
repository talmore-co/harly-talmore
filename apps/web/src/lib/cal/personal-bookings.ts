import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  applications,
  applicationMerges,
  candidates,
  jobs,
  interviews,
  personalCalBookings,
  personalCalConnections,
  personalCalEvents,
  activityEvents,
  candidatePortalNotifications,
} from "@harly/db";
import { getPersonalCalConnection, personalCalApiKey } from "./personal";
import {
  getPersonalCalBooking,
  type PersonalCalBooking,
} from "./personal-client";
import { verifyCalBookingReference } from "./booking-reference";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
} from "@/server/events/emit";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import { lockInterviewerSchedule } from "@/features/interviews/booking-lock";

export async function getPersonalCalSubscription(subscriptionId: string) {
  const [row] = await db
    .select({
      subscription: personalCalEvents,
      connection: personalCalConnections,
    })
    .from(personalCalEvents)
    .innerJoin(
      personalCalConnections,
      eq(personalCalConnections.id, personalCalEvents.connectionId),
    )
    .where(eq(personalCalEvents.id, subscriptionId))
    .limit(1);
  if (!row) return null;
  const active = await getPersonalCalConnection(
    row.connection.workspaceId,
    row.connection.userId,
  );
  return active?.enabled ? row : null;
}

export function validatePersonalBooking(
  booking: PersonalCalBooking,
  eventTypeId: number,
  calUserId: number,
) {
  if (
    (booking.eventType?.id ?? booking.eventTypeId) !== eventTypeId ||
    booking.hosts.length !== 1 ||
    booking.hosts[0]?.id !== calUserId
  ) {
    throw new Error("Booking does not belong to this personal event and host.");
  }
  const duration =
    (Date.parse(booking.end) - Date.parse(booking.start)) / 60000;
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440)
    throw new Error("Invalid booking duration.");
  return duration;
}

export function personalBookingLocation(booking: PersonalCalBooking) {
  const value = booking.location ?? booking.meetingUrl ?? null;
  if (!value) return { mode: "video" as const, location: null, meetLink: null };
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return { mode: "video" as const, location: value, meetLink: value };
  } catch {
    /* An onsite address or phone number is not a URL. */
  }
  return {
    mode: /phone|tel:|\+\d/i.test(value)
      ? ("phone" as const)
      : ("onsite" as const),
    location: value,
    meetLink: null,
  };
}

/** Read Cal.com as the source of truth, following reschedule UID changes. */
export async function syncPersonalCalBooking(
  subscriptionId: string,
  incomingUid: string,
  manualApplicationId?: string,
) {
  const context = await getPersonalCalSubscription(subscriptionId);
  if (!context) throw new Error("Cal.com connection is not available.");
  const { connection, subscription } = context;
  const apiKey = personalCalApiKey(connection);
  const aliases: string[] = [];
  let uid = incomingUid;
  let booking: PersonalCalBooking | undefined;
  for (let i = 0; i < 10; i++) {
    if (aliases.includes(uid)) throw new Error("Invalid reschedule chain.");
    aliases.push(uid);
    booking = await getPersonalCalBooking(apiKey, uid);
    if (booking.uid !== uid) throw new Error("Booking UID mismatch.");
    validatePersonalBooking(
      booking,
      subscription.eventTypeId,
      connection.calUserId,
    );
    if (!booking.rescheduledToUid) break;
    uid = booking.rescheduledToUid;
  }
  if (!booking || booking.rescheduledToUid)
    throw new Error("Reschedule chain is too long.");
  const canonical = booking;
  // A later reschedule can arrive before intermediate webhook deliveries.
  // Resolve the preceding UIDs as well so it still finds the original interview.
  let previousUid = canonical.rescheduledFromUid;
  let nextUid = canonical.uid;
  const predecessors = new Set<string>();
  while (previousUid) {
    if (predecessors.has(previousUid) || predecessors.size >= 10) {
      throw new Error("Invalid reschedule history.");
    }
    predecessors.add(previousUid);
    const previous = await getPersonalCalBooking(apiKey, previousUid);
    validatePersonalBooking(
      previous,
      subscription.eventTypeId,
      connection.calUserId,
    );
    if (previous.uid !== previousUid || previous.rescheduledToUid !== nextUid) {
      throw new Error("Reschedule history mismatch.");
    }
    aliases.push(previousUid);
    nextUid = previousUid;
    previousUid = previous.rescheduledFromUid;
  }
  const durationMins = validatePersonalBooking(
    canonical,
    subscription.eventTypeId,
    connection.calUserId,
  );
  const signedApplicationId = verifyCalBookingReference(
    canonical.metadata?.harlyBookingRef,
    subscription.id,
    subscription.webhookSecret,
  );
  const providerUpdatedAt = new Date(
    canonical.updatedAt ?? canonical.createdAt,
  );

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`personal-cal:${connection.id}`}, 0))`,
    );
    const [active] = await tx
      .select({ enabled: personalCalConnections.enabled })
      .from(personalCalConnections)
      .where(eq(personalCalConnections.id, connection.id))
      .limit(1);
    if (!active?.enabled)
      throw new Error("Cal.com connection was disconnected.");
    const mappings = await tx
      .select()
      .from(personalCalBookings)
      .where(
        and(
          eq(personalCalBookings.connectionId, connection.id),
          inArray(personalCalBookings.bookingUid, aliases),
        ),
      );
    const mapped =
      mappings.find((item) => item.interviewId && item.applicationId) ??
      mappings.find((item) => item.interviewId) ??
      mappings.find((item) => item.applicationId);
    let applicationId =
      mapped?.applicationId ?? manualApplicationId ?? signedApplicationId;
    if (applicationId) {
      const [redirect] = await tx.select({ id: applicationMerges.applicationId }).from(applicationMerges).where(and(eq(applicationMerges.workspaceId, connection.workspaceId), eq(applicationMerges.sourceId, applicationId))).limit(1);
      applicationId = redirect?.id ?? applicationId;
    }
    const attendee = canonical.attendees[0];
    const fields = {
      connectionId: connection.id,
      subscriptionId: subscription.id,
      attendeeName: attendee?.name ?? "Unknown attendee",
      attendeeEmail: attendee?.email ?? "",
      scheduledAt: new Date(canonical.start),
      status: canonical.status,
      updatedAt: new Date(),
    };
    const remember = async (
      appId: string | null,
      interviewId: string | null,
      reason: string | null,
    ) => {
      if (!appId) {
        // Show one inbox item for a reschedule chain. Keep established mappings
        // on earlier UIDs so a later delivery still resolves the same interview.
        await tx
          .delete(personalCalBookings)
          .where(
            and(
              eq(personalCalBookings.connectionId, connection.id),
              inArray(personalCalBookings.bookingUid, aliases),
              ne(personalCalBookings.bookingUid, canonical.uid),
              isNull(personalCalBookings.applicationId),
              isNull(personalCalBookings.interviewId),
            ),
          );
      }
      for (const alias of new Set(aliases)) {
        if (!appId && alias !== canonical.uid) continue;
        const inboxReason = alias === canonical.uid ? reason : null;
        await tx
          .insert(personalCalBookings)
          .values({
            ...fields,
            bookingUid: alias,
            applicationId: appId,
            interviewId,
            reason: inboxReason,
          })
          .onConflictDoUpdate({
            target: [
              personalCalBookings.connectionId,
              personalCalBookings.bookingUid,
            ],
            set: {
              ...fields,
              applicationId: appId,
              interviewId,
              reason: inboxReason,
            },
          });
      }
      await tx
        .update(personalCalConnections)
        .set({ lastReceivedAt: new Date() })
        .where(eq(personalCalConnections.id, connection.id));
    };
    if (!applicationId) {
      await remember(
        null,
        null,
        "Missing, expired or invalid application reference. Select the application manually.",
      );
      return { matched: false, event: null, interview: null, action: null };
    }
    const [application] = await tx
      .select({
        id: applications.id,
        candidateId: applications.candidateId,
        jobId: applications.jobId,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, connection.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, connection.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.workspaceId, connection.workspaceId),
        ),
      )
      .limit(1);
    // Do not reintroduce attendee PII after the referenced application/candidate
    // has been deleted, or persist a reference into another workspace.
    if (!application)
      return { matched: false, event: null, interview: null, action: null };
    if (canonical.status === "pending") {
      await remember(
        application.id,
        mapped?.interviewId ?? null,
        "Booking is awaiting confirmation in Cal.com. Confirm there, then match or refresh here.",
      );
      return { matched: false, event: null, interview: null, action: null };
    }
    const [existing] = mapped?.interviewId
      ? await tx
          .select()
          .from(interviews)
          .where(
            and(
              eq(interviews.id, mapped.interviewId),
              eq(interviews.workspaceId, connection.workspaceId),
              eq(interviews.calConnectionId, connection.id),
            ),
          )
          .limit(1)
      : [];
    if (existing?.calUpdatedAt && existing.calUpdatedAt > providerUpdatedAt)
      return { matched: true, event: null, interview: existing, action: null };
    if (
      existing?.status === "canceled" &&
      existing.calBookingUid === canonical.uid &&
      existing.calUpdatedAt &&
      existing.calUpdatedAt >= providerUpdatedAt &&
      canonical.status === "accepted"
    ) {
      return { matched: true, event: null, interview: existing, action: null };
    }
    if (
      existing &&
      existing.calBookingUid !== canonical.uid &&
      canonical.rescheduledFromUid !== existing.calBookingUid &&
      !aliases.includes(existing.calBookingUid ?? "")
    ) {
      return { matched: true, event: null, interview: existing, action: null };
    }
    const status =
      canonical.status === "accepted"
        ? ("scheduled" as const)
        : ("canceled" as const);
    if (!existing && status === "canceled") {
      await remember(application.id, null, null);
      return { matched: true, event: null, interview: null, action: null };
    }
    if (status === "scheduled") {
      await lockInterviewerSchedule(
        tx,
        connection.workspaceId,
        connection.userId,
      );
      const [conflict] = await tx
        .select({ id: interviews.id })
        .from(interviews)
        .where(
          and(
            eq(interviews.workspaceId, connection.workspaceId),
            eq(interviews.interviewerId, connection.userId),
            eq(interviews.status, "scheduled"),
            existing ? ne(interviews.id, existing.id) : undefined,
            sql`${interviews.scheduledAt} < ${canonical.end}`,
            sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${canonical.start}`,
          ),
        )
        .limit(1);
      if (conflict) {
        await remember(
          application.id,
          existing?.id ?? null,
          "This recruiter already has an overlapping Talmore interview. Resolve the time in Cal.com, then match the booking again.",
        );
        return {
          matched: false,
          event: null,
          interview: existing ?? null,
          action: null,
        };
      }
    }
    const location = personalBookingLocation(canonical);
    const values = {
      workspaceId: connection.workspaceId,
      applicationId: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      interviewerId: connection.userId,
      title: canonical.title,
      type: "screening" as const,
      ...location,
      status:
        existing?.status === "completed" &&
        status === "scheduled" &&
        existing.calBookingUid === canonical.uid
          ? ("completed" as const)
          : status,
      scheduledAt: new Date(canonical.start),
      durationMins,
      source: "cal.com-personal",
      calBookingUid: canonical.uid,
      calConnectionId: connection.id,
      calUpdatedAt: providerUpdatedAt,
    };
    const changed =
      !existing ||
      existing.calBookingUid !== canonical.uid ||
      existing.status !== values.status ||
      existing.scheduledAt.getTime() !== values.scheduledAt.getTime() ||
      existing.durationMins !== durationMins ||
      existing.location !== values.location ||
      existing.title !== values.title;
    const [saved] = existing
      ? await tx
          .update(interviews)
          .set({ ...values, updatedAt: new Date() })
          .where(
            and(
              eq(interviews.id, existing.id),
              eq(interviews.workspaceId, connection.workspaceId),
            ),
          )
          .returning()
      : await tx.insert(interviews).values(values).returning();
    if (!saved) throw new Error("Could not save the interview.");
    await remember(application.id, saved.id, null);
    if (!changed)
      return { matched: true, event: null, interview: saved, action: null };
    const action =
      status === "canceled"
        ? ("canceled" as const)
        : existing
          ? ("rescheduled" as const)
          : ("scheduled" as const);
    await tx.insert(activityEvents).values({
      workspaceId: connection.workspaceId,
      actorId: null,
      entityType: "application",
      entityId: application.id,
      type: `interview.${action}`,
      metadata: { interviewId: saved.id, via: "cal.com-personal" },
    });
    await tx.insert(candidatePortalNotifications).values({
      workspaceId: connection.workspaceId,
      candidateId: application.candidateId,
      type: `interview_${action}`,
      title: `Interview ${action}`,
      body: `Interview ${action} through Cal.com.`,
      href: `/portal/applications/${application.id}`,
      metadata: { interviewId: saved.id, applicationId: application.id },
    });
    const event = await persistDomainEvent(tx, {
      name: `interview.${action}`,
      workspaceId: connection.workspaceId,
      aggregateType: "interview",
      aggregateId: saved.id,
      payload: {
        interview: {
          id: saved.id,
          applicationId: saved.applicationId,
          candidateId: saved.candidateId,
          jobId: saved.jobId,
          interviewerId: saved.interviewerId,
          scheduledAt: saved.scheduledAt.toISOString(),
          status: saved.status,
          source: saved.source,
        },
      },
    });
    return { matched: true, event, interview: saved, action };
  });
  if (outcome.event) await publishPersistedDomainEvents([outcome.event]);
  if (outcome.action && outcome.interview) {
    await emitWebhookEvent(
      connection.workspaceId,
      `interview.${outcome.action}`,
      {
        interview: {
          id: outcome.interview.id,
          applicationId: outcome.interview.applicationId,
          source: "cal.com-personal",
        },
      },
      { skipDomainEvent: true },
    );
  }
  // Cal.com owns invitations and video links. Do not invoke email or calendar sync.
  return { matched: outcome.matched };
}
