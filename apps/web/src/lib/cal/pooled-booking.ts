import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import {
  applications,
  automationBookingInvitations,
  db,
  interviews,
  personalCalEvents,
} from "@harly/db";
import { bookingInvitationAllowed } from "./invitation-access";
import {
  applicationHasInterview,
  loadActiveAutomationApplication,
} from "@/features/automations/candidate-messages";
import { lockInterviewerSchedule } from "@/features/interviews/booking-lock";
import { personalCalApiKey } from "./personal";
import {
  invitationIdFromToken,
  verifyBookingInvitation,
} from "./invitation-token";
import {
  createPersonalCalBooking,
  findPooledCalBooking,
  getPersonalCalSlots,
} from "./pooled-client";
import { CalApiError } from "./personal-client";
import { signCalBookingReference } from "./booking-reference";
import { syncPersonalCalBooking } from "./personal-bookings";
import { loadInvitationHosts, validatePoolHost } from "./pool-hosts";

export class BookingPageError extends Error {}
const unavailable = () =>
  new BookingPageError(
    "This invitation is no longer available. Please contact your recruiter.",
  );

async function invitationContext(token: string) {
  const id = invitationIdFromToken(token);
  if (!id) throw unavailable();
  const [invitation] = await db
    .select()
    .from(automationBookingInvitations)
    .where(eq(automationBookingInvitations.id, id));
  if (
    !invitation?.tokenSecret ||
    !verifyBookingInvitation(token, id, invitation.tokenSecret) ||
    !invitation.expiresAt ||
    invitation.expiresAt.getTime() <= Date.now()
  )
    throw unavailable();
  if (!await bookingInvitationAllowed(invitation)) throw unavailable();
  const target = await loadActiveAutomationApplication(
    invitation.workspaceId,
    invitation.applicationId,
  );
  if (!target?.candidate.email || target.application.currentStageId !== invitation.stageId)
    throw unavailable();
  return { invitation, target };
}

export function mergeBookingSlots(
  rows: { eventId: string; slots: string[] }[],
) {
  const slots = new Map<string, string[]>();
  for (const row of rows)
    for (const start of row.slots) {
      const key = new Date(start).toISOString();
      const hosts = slots.get(key) ?? [];
      if (!hosts.includes(row.eventId)) hosts.push(row.eventId);
      slots.set(key, hosts);
    }
  return slots;
}

async function availableHostSlots(
  invitation: typeof automationBookingInvitations.$inferSelect,
  from: Date,
  to: Date,
) {
  const hosts = (
    await loadInvitationHosts(invitation.workspaceId, invitation.eventIds)
  ).filter(
    (host) =>
      host.event.webhookId &&
      host.event.durationMins === invitation.durationMins &&
      host.connection.apiKeyCiphertext,
  );
  if (!hosts.length)
    throw new BookingPageError(
      "No recruiters are available for online booking. Please contact your recruiter.",
    );
  const results = await Promise.allSettled(
    hosts.map(async (host) => {
      if ((await validatePoolHost(host)) !== invitation.locationFormat)
        throw new Error("Interview format changed.");
      const starts = await getPersonalCalSlots(
        personalCalApiKey(host.connection),
        host.event.eventTypeId,
        from,
        to,
      );
      const conflicts = await db
        .select({
          start: interviews.scheduledAt,
          duration: interviews.durationMins,
        })
        .from(interviews)
        .where(
          and(
            eq(interviews.workspaceId, invitation.workspaceId),
            eq(interviews.interviewerId, host.connection.userId),
            eq(interviews.status, "scheduled"),
            sql`${interviews.scheduledAt} < ${to.toISOString()}`,
            sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${from.toISOString()}`,
          ),
        );
      const reservations = await db
        .select({
          start: automationBookingInvitations.bookingStartAt,
          duration: automationBookingInvitations.durationMins,
        })
        .from(automationBookingInvitations)
        .innerJoin(
          personalCalEvents,
          eq(
            personalCalEvents.id,
            automationBookingInvitations.selectedEventId,
          ),
        )
        .where(
          and(
            eq(
              automationBookingInvitations.workspaceId,
              invitation.workspaceId,
            ),
            inArray(automationBookingInvitations.bookingState, [
              "booking",
              "review",
            ]),
            eq(personalCalEvents.connectionId, host.connection.id),
            ne(automationBookingInvitations.id, invitation.id),
          ),
        );
      const busy = [...conflicts, ...reservations].filter(
        (item) => item.start && item.duration,
      );
      const slots = starts.filter((start) => {
        const at = Date.parse(start),
          end = at + host.event.durationMins * 60000;
        return (
          at > Date.now() &&
          at >= from.getTime() &&
          at < to.getTime() &&
          !busy.some(
            (item) =>
              item.start!.getTime() < end &&
              item.start!.getTime() + item.duration! * 60000 > at,
          )
        );
      });
      return { eventId: host.event.id, slots };
    }),
  );
  const fulfilled = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (!fulfilled.length)
    throw new BookingPageError(
      "We could not load availability. Please try again shortly.",
    );
  return { hosts, slots: mergeBookingSlots(fulfilled) };
}

async function reconcileKnownBooking(
  invitation: typeof automationBookingInvitations.$inferSelect,
) {
  if (
    invitation.bookingUid &&
    invitation.selectedEventId &&
    invitation.bookingState !== "confirmed" &&
    invitation.bookingState !== "canceled"
  ) {
    await syncPersonalCalBooking(
      invitation.selectedEventId,
      invitation.bookingUid,
    ).catch(() => undefined);
  }
  const [current] = await db
    .select()
    .from(automationBookingInvitations)
    .where(eq(automationBookingInvitations.id, invitation.id));
  return current ?? invitation;
}

export async function reconcilePooledBookings() {
  const pending = await db
    .select()
    .from(automationBookingInvitations)
    .where(
      and(
        inArray(automationBookingInvitations.bookingState, [
          "booking",
          "review",
        ]),
        lt(
          automationBookingInvitations.updatedAt,
          new Date(Date.now() - 60000),
        ),
      ),
    )
    .orderBy(sql`random()`)
    .limit(5);
  const results = await Promise.allSettled(
    pending.map(async (invitation) => {
      if (
        !invitation.selectedEventId ||
        !invitation.bookingRequestId ||
        !invitation.bookingStartAt ||
        !invitation.durationMins
      )
        return;
      let uid = invitation.bookingUid;
      if (!uid) {
        const [host] = await loadInvitationHosts(invitation.workspaceId, [
          invitation.selectedEventId,
        ]);
        if (!host) return;
        uid = await findPooledCalBooking(
          personalCalApiKey(host.connection),
          host.event.eventTypeId,
          invitation.bookingStartAt,
          invitation.durationMins,
          invitation.id,
          invitation.bookingRequestId,
        );
      }
      if (uid) await syncPersonalCalBooking(invitation.selectedEventId, uid);
    }),
  );
  return {
    checked: pending.length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export async function getPooledBookingPage(
  token: string,
  requestedFrom?: string,
) {
  const context = await invitationContext(token);
  const invitation = await reconcileKnownBooking(context.invitation);
  const base = {
    jobTitle: context.target.job.title,
    firstName: context.target.candidate.firstName,
    durationMins: invitation.durationMins!,
    state: invitation.bookingState,
    slots: [] as string[],
  };
  if (invitation.bookingState !== "open") return base;
  if (
    await applicationHasInterview(
      invitation.workspaceId,
      invitation.applicationId,
    )
  )
    return { ...base, state: "confirmed" as const };
  const from = requestedFrom ? new Date(requestedFrom) : new Date();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (
    !Number.isFinite(from.getTime()) ||
    from < today ||
    from.getTime() > Date.now() + 60 * 86400000
  )
    throw new BookingPageError("Choose a date within the next 60 days.");
  const to = new Date(from.getTime() + 7 * 86400000);
  const available = await availableHostSlots(invitation, from, to);
  return { ...base, slots: [...available.slots.keys()].sort() };
}

/** Persist the selected host before the remote write. Unknown results never fail over to another host. */
export async function confirmPooledBooking(
  token: string,
  start: string,
  timeZone: string,
) {
  const { invitation } = await invitationContext(token);
  if (invitation.bookingState !== "open") return getPooledBookingPage(token);
  const at = new Date(start);
  if (
    !Number.isFinite(at.getTime()) ||
    at.getTime() <= Date.now() ||
    at.getTime() > Date.now() + 67 * 86400000
  )
    throw new BookingPageError("Please choose an available future time.");
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new BookingPageError("Choose a valid time zone.");
  }
  const available = await availableHostSlots(
    invitation,
    at,
    new Date(at.getTime() + 86400000),
  );
  const eligible = available.slots.get(at.toISOString()) ?? [];
  if (!eligible.length)
    throw new BookingPageError(
      "That time is no longer available. Please choose another time.",
    );
  const requestId = randomUUID();
  const chosen = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`pooled-booking:${invitation.applicationId}`}, 0))`,
    );
    const [current] = await tx
      .select()
      .from(automationBookingInvitations)
      .where(eq(automationBookingInvitations.id, invitation.id))
      .for("update");
    if (!current || current.bookingState !== "open") return null;
    if (
      current.definitionVersion !== invitation.definitionVersion ||
      current.revision !== invitation.revision ||
      current.durationMins !== invitation.durationMins ||
      JSON.stringify(current.eventIds) !== JSON.stringify(invitation.eventIds)
    )
      throw new BookingPageError(
        "The recruiter pool has changed. Please refresh availability.",
      );
    // Another invitation for this application may already be in flight.
    const [pending] = await tx
      .select({ id: automationBookingInvitations.id })
      .from(automationBookingInvitations)
      .where(
        and(
          eq(automationBookingInvitations.workspaceId, invitation.workspaceId),
          eq(
            automationBookingInvitations.applicationId,
            invitation.applicationId,
          ),
          inArray(automationBookingInvitations.bookingState, [
            "booking",
            "review",
            "confirmed",
          ]),
        ),
      )
      .limit(1);
    if (
      pending ||
      (await applicationHasInterview(
        invitation.workspaceId,
        invitation.applicationId,
      ))
    )
      throw new BookingPageError(
        "An interview is already booked or being confirmed. Please contact your recruiter.",
      );
    const [app] = await tx
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, invitation.applicationId),
          eq(applications.workspaceId, invitation.workspaceId),
        ),
      )
      .for("update");
    if (
      !app ||
      app.status !== "active" ||
      app.currentStageId !== invitation.stageId
    )
      throw unavailable();
    // Least recently selected host, serialized across this workspace's pool selections.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`pooled-hosts:${invitation.workspaceId}`}, 0))`,
    );
    const previous = await tx
      .select({
        connectionId: personalCalEvents.connectionId,
        at: sql<
          string | null
        >`max(${automationBookingInvitations.bookingAttemptAt})`,
      })
      .from(automationBookingInvitations)
      .innerJoin(
        personalCalEvents,
        eq(personalCalEvents.id, automationBookingInvitations.selectedEventId),
      )
      .where(
        and(
          eq(automationBookingInvitations.workspaceId, invitation.workspaceId),
          inArray(
            personalCalEvents.connectionId,
            available.hosts.map((host) => host.connection.id),
          ),
        ),
      )
      .groupBy(personalCalEvents.connectionId);
    const lastUsed = new Map(
      available.hosts.map((host) => {
        const row = previous.find(
          (item) => item.connectionId === host.connection.id,
        );
        return [
          host.event.id,
          row?.at ? new Date(row.at).getTime() : 0,
        ] as const;
      }),
    );
    for (const eventId of eligible.sort(
      (a, b) =>
        (lastUsed.get(a) ?? 0) - (lastUsed.get(b) ?? 0) || a.localeCompare(b),
    )) {
      const host = available.hosts.find((item) => item.event.id === eventId)!;
      await lockInterviewerSchedule(
        tx,
        invitation.workspaceId,
        host.connection.userId,
      );
      const [conflict] = await tx
        .select({ id: interviews.id })
        .from(interviews)
        .where(
          and(
            eq(interviews.workspaceId, invitation.workspaceId),
            eq(interviews.interviewerId, host.connection.userId),
            eq(interviews.status, "scheduled"),
            sql`${interviews.scheduledAt} < ${new Date(at.getTime() + invitation.durationMins! * 60000).toISOString()}`,
            sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${at.toISOString()}`,
          ),
        )
        .limit(1);
      const [reserved] = await tx
        .select({ id: automationBookingInvitations.id })
        .from(automationBookingInvitations)
        .innerJoin(
          personalCalEvents,
          eq(
            personalCalEvents.id,
            automationBookingInvitations.selectedEventId,
          ),
        )
        .where(
          and(
            eq(
              automationBookingInvitations.workspaceId,
              invitation.workspaceId,
            ),
            eq(personalCalEvents.connectionId, host.connection.id),
            inArray(automationBookingInvitations.bookingState, [
              "booking",
              "review",
            ]),
            sql`${automationBookingInvitations.bookingStartAt} < ${new Date(at.getTime() + invitation.durationMins! * 60000).toISOString()}`,
            sql`${automationBookingInvitations.bookingStartAt} + (${automationBookingInvitations.durationMins} * interval '1 minute') > ${at.toISOString()}`,
          ),
        )
        .limit(1);
      if (conflict || reserved) continue;
      await tx
        .update(automationBookingInvitations)
        .set({
          bookingState: "booking",
          selectedEventId: eventId,
          bookingRequestId: requestId,
          bookingAttemptAt: new Date(),
          bookingStartAt: at,
          updatedAt: new Date(),
        })
        .where(eq(automationBookingInvitations.id, invitation.id));
      return host;
    }
    throw new BookingPageError(
      "That time has just been taken. Please choose another time.",
    );
  });
  if (!chosen) return getPooledBookingPage(token);
  let attempted = false;
  let accepted = false;
  try {
    // Recheck workflow, membership, stage and connection immediately before the provider write.
    const fresh = await invitationContext(token);
    if (!fresh.target.candidate.email) throw unavailable();
    const [activeHost] = await loadInvitationHosts(invitation.workspaceId, [
      chosen.event.id,
    ]);
    if (!activeHost?.event.webhookId) throw unavailable();
    if ((await validatePoolHost(activeHost)) !== invitation.locationFormat)
      throw unavailable();
    attempted = true;
    const booking = await createPersonalCalBooking(
      personalCalApiKey(activeHost.connection),
      {
        eventTypeId: chosen.event.eventTypeId,
        start: at.toISOString(),
        attendee: {
          name: `${fresh.target.candidate.firstName} ${fresh.target.candidate.lastName}`.trim(),
          email: fresh.target.candidate.email,
          timeZone,
        },
        metadata: {
          harlyBookingRef: signCalBookingReference(
            invitation.applicationId,
            chosen.event.id,
            chosen.event.webhookSecret,
          ),
          talmoreInvitationId: invitation.id,
          talmoreBookingRequestId: requestId,
        },
      },
    );
    accepted = true;
    await db
      .update(automationBookingInvitations)
      .set({ bookingUid: booking.uid, updatedAt: new Date() })
      .where(
        and(
          eq(automationBookingInvitations.id, invitation.id),
          eq(automationBookingInvitations.bookingRequestId, requestId),
        ),
      );
    await syncPersonalCalBooking(chosen.event.id, booking.uid);
  } catch (error) {
    const rejected =
      !accepted &&
      error instanceof CalApiError &&
      [400, 401, 403, 404, 409, 422, 429].includes(error.status);
    await db
      .update(automationBookingInvitations)
      .set({
        bookingState: rejected || !attempted ? "open" : "review",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automationBookingInvitations.id, invitation.id),
          eq(automationBookingInvitations.bookingRequestId, requestId),
          eq(automationBookingInvitations.bookingState, "booking"),
          isNull(automationBookingInvitations.bookingUid),
        ),
      );
    if (rejected)
      throw new BookingPageError(
        "We could not confirm this time. Please refresh availability or contact your recruiter.",
      );
    if (error instanceof BookingPageError) throw error;
    // A webhook can resolve an accepted request even when this HTTP response was lost.
  }
  return getPooledBookingPage(token);
}
