"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  personalCalConnections,
  personalCalEvents,
  personalCalBookings,
  applications,
  candidates,
  jobs,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requireApplicationPermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import {
  getPersonalCalConnection,
  personalCalApiKey,
  personalCalWebhookUrl,
} from "@/lib/cal/personal";
import {
  CalApiError,
  getCalProfile,
  listPersonalCalEvents,
  createPersonalCalEvent,
  ensurePersonalCalWebhook,
  removePersonalCalWebhook,
} from "@/lib/cal/personal-client";
import { signCalBookingReference } from "@/lib/cal/booking-reference";
import { buildCalBookingLink } from "@/lib/cal/link";
import { syncPersonalCalBooking } from "@/lib/cal/personal-bookings";

type Result = { ok: true } | { ok: false; error: string };

async function ownConnection() {
  const context = await getWorkspaceContext();
  const connection = await getPersonalCalConnection(
    context.organization.id,
    context.user.id,
  );
  if (!connection) throw new Error("Connect Cal.com first.");
  return connection;
}

export async function getMyCalConnection() {
  const context = await getWorkspaceContext();
  const connection = await getPersonalCalConnection(
    context.organization.id,
    context.user.id,
  );
  const events = connection
    ? await db
        .select({
          eventTypeId: personalCalEvents.eventTypeId,
          title: personalCalEvents.title,
          bookingUrl: personalCalEvents.bookingUrl,
          durationMins: personalCalEvents.durationMins,
          webhookId: personalCalEvents.webhookId,
        })
        .from(personalCalEvents)
        .where(eq(personalCalEvents.connectionId, connection.id))
    : [];
  const unmatched = connection
    ? await db
        .select({
          id: personalCalBookings.id,
          attendeeName: personalCalBookings.attendeeName,
          attendeeEmail: personalCalBookings.attendeeEmail,
          scheduledAt: personalCalBookings.scheduledAt,
          applicationId: personalCalBookings.applicationId,
          reason: personalCalBookings.reason,
          status: personalCalBookings.status,
        })
        .from(personalCalBookings)
        .where(
          and(
            eq(personalCalBookings.connectionId, connection.id),
            isNotNull(personalCalBookings.reason),
          ),
        )
        .limit(50)
    : [];
  return {
    workspaceId: context.organization.id,
    configured: isEncryptionConfigured(),
    connection: connection
      ? {
          enabled: connection.enabled,
          accountEmail: connection.accountEmail,
          username: connection.username,
          defaultEventTypeId: connection.defaultEventTypeId,
          lastReceivedAt: connection.lastReceivedAt?.toISOString() ?? null,
        }
      : null,
    events: events.map(({ webhookId, ...event }) => ({
      ...event,
      webhookConfigured: Boolean(webhookId),
    })),
    unmatched: unmatched.map((booking) => ({
      ...booking,
      scheduledAt: booking.scheduledAt.toISOString(),
    })),
  };
}

export async function connectMyCalAccount(input: {
  apiKey: string;
}): Promise<Result> {
  const context = await getWorkspaceContext();
  const parsed = z
    .object({ apiKey: z.string().trim().min(10).max(1000) })
    .safeParse(input);
  if (!parsed.success || !isEncryptionConfigured())
    return {
      ok: false,
      error: "Enter a Cal.com API key. Server encryption must be configured.",
    };
  let stage: "profile" | "storage" = "profile";
  try {
    const profile = await getCalProfile(parsed.data.apiKey);
    stage = "storage";
    const encrypted = encryptSecret(parsed.data.apiKey);
    const credentials = {
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      enabled: true,
      username: profile.username,
      accountEmail: profile.email,
      updatedAt: new Date(),
    };
    const saved = await db
      .insert(personalCalConnections)
      .values({
        workspaceId: context.organization.id,
        userId: context.user.id,
        calUserId: profile.id,
        ...credentials,
      })
      .onConflictDoUpdate({
        target: [
          personalCalConnections.workspaceId,
          personalCalConnections.userId,
        ],
        set: credentials,
        setWhere: eq(personalCalConnections.calUserId, profile.id),
      })
      .returning({ id: personalCalConnections.id });
    if (!saved.length)
      return {
        ok: false,
        error:
          "Use an API key from the Cal.com account already linked to this profile.",
      };
    return { ok: true };
  } catch (error) {
    if (stage === "storage") {
      return { ok: false, error: "Cal.com accepted your key, but Talmore could not save the connection. Check the database migrations and server encryption configuration." };
    }
    if (error instanceof CalApiError) {
      if (error.status === 401 || error.status === 403) {
        return { ok: false, error: "Cal.com rejected this API key or its permissions. Check that the key is active and belongs to your personal account." };
      }
      if (error.status === 429) {
        return { ok: false, error: "Cal.com is rate-limiting requests. Wait a moment and try again." };
      }
      return { ok: false, error: `Cal.com could not return your account details (HTTP ${error.status}). Please try again later.` };
    }
    return {
      ok: false,
      error:
        "Talmore could not reach Cal.com or read your account details. Check the server's outbound connection and try again.",
    };
  }
}

export async function listMyCalEvents() {
  try {
    const connection = await ownConnection();
    const events = await listPersonalCalEvents(personalCalApiKey(connection), {
      id: connection.calUserId,
      username: connection.username,
    });
    return {
      ok: true as const,
      events: events.map(({ id, title, lengthInMinutes, bookingUrl }) => ({
        id,
        title,
        durationMins: lengthInMinutes,
        bookingUrl,
      })),
    };
  } catch {
    return {
      ok: false as const,
      error:
        "Could not load Cal.com events. Check your connection and API key.",
    };
  }
}

export async function createMyCalEvent(input: {
  title: string;
  durationMins: number;
}) {
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(100),
      durationMins: z.number().int().min(5).max(480),
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "Enter an event name and a duration between 5 and 480 minutes.",
    };
  try {
    const connection = await ownConnection();
    const event = await createPersonalCalEvent(
      personalCalApiKey(connection),
      parsed.data.title,
      parsed.data.durationMins,
      `harly-interview-${randomUUID().slice(0, 8)}`,
    );
    return { ok: true as const, eventId: event.id };
  } catch {
    return {
      ok: false as const,
      error:
        "Could not create the event. Check your Cal.com API key and try again.",
    };
  }
}

export async function saveMyCalEvent(input: {
  eventTypeId: number;
}): Promise<Result> {
  if (!z.number().int().positive().safeParse(input.eventTypeId).success)
    return { ok: false, error: "Select an interview event." };
  try {
    const connection = await ownConnection();
    const events = await listPersonalCalEvents(personalCalApiKey(connection), {
      id: connection.calUserId,
      username: connection.username,
    });
    const event = events.find((item) => item.id === input.eventTypeId);
    if (!event)
      return {
        ok: false,
        error: "Select an event owned by your connected Cal.com account.",
      };
    const callbackUrl = new URL(personalCalWebhookUrl(randomUUID()));
    if (
      callbackUrl.protocol !== "https:" ||
      callbackUrl.hostname === "localhost"
    )
      return {
        ok: false,
        error:
          "Webhook setup requires a publicly reachable HTTPS Talmore URL. Use the deployed instance or a development tunnel.",
      };
    // Commit the callback identity before contacting Cal.com. Failed/uncertain
    // remote requests can then be reconciled using the same URL and secret.
    await db
      .insert(personalCalEvents)
      .values({
        connectionId: connection.id,
        eventTypeId: event.id,
        title: event.title,
        durationMins: event.lengthInMinutes,
        bookingUrl: event.bookingUrl,
        webhookSecret: randomBytes(32).toString("hex"),
      })
      .onConflictDoNothing({
        target: [personalCalEvents.connectionId, personalCalEvents.eventTypeId],
      });
    // Serialize remote reconciliation with disconnect as well as the DB write.
    // Moving HTTP before this lock can recreate a webhook during disconnect or
    // race two creates. Each provider request has a 15-second timeout.
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`personal-cal:${connection.id}`}, 0))`,
      );
      const [current] = await tx
        .select()
        .from(personalCalConnections)
        .where(eq(personalCalConnections.id, connection.id))
        .limit(1);
      const apiKey = personalCalApiKey(current!);
      const [previous] = await tx
        .select()
        .from(personalCalEvents)
        .where(
          and(
            eq(personalCalEvents.connectionId, connection.id),
            eq(personalCalEvents.eventTypeId, event.id),
          ),
        )
        .limit(1);
      if (!previous) throw new Error("Event subscription not found.");
      const subscriptionId = previous.id;
      const callback = personalCalWebhookUrl(subscriptionId);
      const secret = previous.webhookSecret;
      const webhookId = await ensurePersonalCalWebhook(
        apiKey,
        event.id,
        callback,
        secret,
      );
      const subscriptions = await tx
        .select()
        .from(personalCalEvents)
        .where(eq(personalCalEvents.connectionId, connection.id));
      for (const older of subscriptions) {
        if (older.id === subscriptionId || older.webhookId) continue;
        const restoredId = await ensurePersonalCalWebhook(
          apiKey,
          older.eventTypeId,
          personalCalWebhookUrl(older.id),
          older.webhookSecret,
        );
        await tx
          .update(personalCalEvents)
          .set({ webhookId: restoredId, updatedAt: new Date() })
          .where(eq(personalCalEvents.id, older.id));
      }
      await tx
        .insert(personalCalEvents)
        .values({
          id: subscriptionId,
          connectionId: connection.id,
          eventTypeId: event.id,
          title: event.title,
          durationMins: event.lengthInMinutes,
          bookingUrl: event.bookingUrl,
          webhookSecret: secret,
          webhookId,
        })
        .onConflictDoUpdate({
          target: [
            personalCalEvents.connectionId,
            personalCalEvents.eventTypeId,
          ],
          set: {
            title: event.title,
            bookingUrl: event.bookingUrl,
            durationMins: event.lengthInMinutes,
            webhookId,
            updatedAt: new Date(),
          },
        });
      await tx
        .update(personalCalConnections)
        .set({ defaultEventTypeId: event.id, updatedAt: new Date() })
        .where(eq(personalCalConnections.id, connection.id));
      return { ok: true as const };
    });
  } catch {
    return {
      ok: false,
      error:
        "Could not configure booking sync. Check your API key and public Talmore URL, then retry.",
    };
  }
}

export async function disconnectMyCalAccount(): Promise<Result> {
  try {
    const connection = await ownConnection();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`personal-cal:${connection.id}`}, 0))`,
      );
      const [current] = await tx
        .select()
        .from(personalCalConnections)
        .where(eq(personalCalConnections.id, connection.id))
        .limit(1);
      const apiKey = personalCalApiKey(current!);
      const events = await tx
        .select()
        .from(personalCalEvents)
        .where(eq(personalCalEvents.connectionId, connection.id));
      for (const event of events)
        await removePersonalCalWebhook(
          apiKey,
          event.eventTypeId,
          personalCalWebhookUrl(event.id),
        );
      await tx
        .update(personalCalEvents)
        .set({ webhookId: null })
        .where(eq(personalCalEvents.connectionId, connection.id));
      await tx
        .update(personalCalConnections)
        .set({
          enabled: false,
          apiKeyCiphertext: null,
          apiKeyIv: null,
          apiKeyTag: null,
          updatedAt: new Date(),
        })
        .where(eq(personalCalConnections.id, connection.id));
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Could not remove the Cal.com webhooks. Check your key and retry disconnecting.",
    };
  }
}

export async function createCandidateCalLink(input: {
  applicationId: string;
  interviewerId: string;
}) {
  const parsed = z
    .object({
      applicationId: z.string().uuid(),
      interviewerId: z.string().min(1),
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "Choose an application and interviewer.",
    };
  const context = await requireApplicationPermission(
    "collab:write",
    parsed.data.applicationId,
  );
  const connection = await getPersonalCalConnection(
    context.organization.id,
    parsed.data.interviewerId,
  );
  if (!connection?.enabled || !connection.defaultEventTypeId)
    return {
      ok: false as const,
      error:
        "This interviewer needs to connect Cal.com and select an interview event in Account → Connections.",
    };
  const [event] = await db
    .select()
    .from(personalCalEvents)
    .where(
      and(
        eq(personalCalEvents.connectionId, connection.id),
        eq(personalCalEvents.eventTypeId, connection.defaultEventTypeId),
      ),
    )
    .limit(1);
  if (!event?.webhookId)
    return {
      ok: false as const,
      error: "This interviewer's Cal.com booking sync is not configured.",
    };
  const [application] = await db
    .select({
      name: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, context.organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.id, applications.jobId), isNull(jobs.deletedAt)),
    )
    .where(
      and(
        eq(applications.id, parsed.data.applicationId),
        eq(applications.workspaceId, context.organization.id),
      ),
    )
    .limit(1);
  if (!application)
    return { ok: false as const, error: "Application not found." };
  return {
    ok: true as const,
    url: buildCalBookingLink({
      bookingUrl: event.bookingUrl,
      name: `${application.name} ${application.lastName}`,
      email: application.email,
      metadata: {
        harlyBookingRef: signCalBookingReference(
          parsed.data.applicationId,
          event.id,
          event.webhookSecret,
        ),
      },
    }),
  };
}

export async function getMyCalBookingMatches(input: { bookingId: string }) {
  const connection = await ownConnection();
  if (!z.string().uuid().safeParse(input.bookingId).success) return [];
  const [booking] = await db
    .select()
    .from(personalCalBookings)
    .where(
      and(
        eq(personalCalBookings.id, input.bookingId),
        eq(personalCalBookings.connectionId, connection.id),
      ),
    )
    .limit(1);
  if (!booking) return [];
  const matches = await db
    .select({
      applicationId: applications.id,
      jobTitle: jobs.title,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, connection.workspaceId),
        eq(candidates.email, booking.attendeeEmail.toLowerCase()),
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
    .where(eq(applications.workspaceId, connection.workspaceId))
    .limit(50);
  const allowed = await Promise.all(
    matches.map(async (match) => {
      try {
        await requireApplicationPermission("collab:write", match.applicationId);
        return match;
      } catch {
        return null;
      }
    }),
  );
  return allowed.filter((match) => match !== null);
}

export async function matchMyCalBooking(input: {
  bookingId: string;
  applicationId: string;
}): Promise<Result> {
  const parsed = z
    .object({ bookingId: z.string().uuid(), applicationId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Select an application to match." };
  try {
    const context = await requireApplicationPermission(
      "collab:write",
      parsed.data.applicationId,
    );
    const connection = await ownConnection();
    if (connection.workspaceId !== context.organization.id)
      return { ok: false, error: "Application not found." };
    const [booking] = await db
      .select()
      .from(personalCalBookings)
      .where(
        and(
          eq(personalCalBookings.id, parsed.data.bookingId),
          eq(personalCalBookings.connectionId, connection.id),
          isNotNull(personalCalBookings.reason),
        ),
      )
      .limit(1);
    if (!booking) return { ok: false, error: "Unmatched booking not found." };
    if (
      booking.applicationId &&
      booking.applicationId !== parsed.data.applicationId
    ) {
      return {
        ok: false,
        error:
          "This booking already belongs to another application. Resolve its booking issue, then retry with the original application.",
      };
    }
    const result = await syncPersonalCalBooking(
      booking.subscriptionId,
      booking.bookingUid,
      parsed.data.applicationId,
    );
    return result.matched
      ? { ok: true }
      : {
          ok: false,
          error:
            "The booking still needs attention. Check its confirmation, interview conflicts and application, then retry.",
        };
  } catch {
    return {
      ok: false,
      error:
        "Could not match this booking. Check your Cal.com connection and application access.",
    };
  }
}
