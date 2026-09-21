import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  member,
  personalCalConnections,
  personalCalEvents,
} from "@harly/db";
import { z } from "zod";
import { personalCalFetch } from "./personal-client";
import { personalCalApiKey } from "./personal";

export async function loadInvitationHosts(
  workspaceId: string,
  eventIds: string[],
) {
  if (!eventIds.length || eventIds.length > 10) return [];
  return db
    .select({ connection: personalCalConnections, event: personalCalEvents })
    .from(personalCalEvents)
    .innerJoin(
      personalCalConnections,
      and(
        eq(personalCalConnections.id, personalCalEvents.connectionId),
        eq(personalCalConnections.workspaceId, workspaceId),
        eq(personalCalConnections.enabled, true),
      ),
    )
    .innerJoin(
      member,
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, personalCalConnections.userId),
        eq(member.status, "active"),
      ),
    )
    .where(inArray(personalCalEvents.id, eventIds));
}

const eventSchema = z.object({
  id: z.number(),
  ownerId: z.number(),
  users: z.array(z.object({ id: z.number() })),
  lengthInMinutes: z.number(),
  lengthInMinutesOptions: z.array(z.number()).optional(),
  locations: z.array(
    z.object({
      type: z.string(),
      integration: z.string().optional(),
      address: z.string().optional(),
    }),
  ),
  price: z.number(),
  recurrence: z.object({ disabled: z.boolean().optional() }).nullish(),
  seats: z.object({ disabled: z.boolean().optional() }).nullish(),
  seatsPerTimeSlot: z.number().nullish(),
  isInstantEvent: z.boolean(),
  bookingProposalCount: z.number().nullish(),
  requiresBookerEmailVerification: z.boolean().optional(),
  bookingFields: z.array(
    z.object({
      field: z.string(),
      required: z.boolean().optional(),
      hidden: z.boolean().optional(),
      label: z.string().optional(),
      slug: z.string().optional(),
      variant: z.string().optional(),
    }),
  ),
});

export async function validatePoolHost(
  host: Awaited<ReturnType<typeof loadInvitationHosts>>[number],
) {
  const event = eventSchema.parse(
    await personalCalFetch(
      personalCalApiKey(host.connection),
      `/event-types/${host.event.eventTypeId}`,
      "GET",
      undefined,
      "2026-06-12",
    ),
  );
  if (
    event.id !== host.event.eventTypeId ||
    event.ownerId !== host.connection.calUserId ||
    event.users.some((user) => user.id !== host.connection.calUserId)
  )
    throw new Error(
      "Use a personal, single-host Cal.com event for each recruiter.",
    );
  if (
    event.lengthInMinutes !== host.event.durationMins ||
    (event.lengthInMinutesOptions?.length ?? 0) > 1
  )
    throw new Error(
      "Use a fixed interview duration and re-save your default Cal.com event in Account → Connections.",
    );
  if (
    event.price > 0 ||
    event.isInstantEvent ||
    event.bookingProposalCount ||
    event.requiresBookerEmailVerification ||
    (event.recurrence && !event.recurrence.disabled) ||
    (event.seats && !event.seats.disabled) ||
    event.seatsPerTimeSlot
  )
    throw new Error(
      "This Cal.com event requires a booking flow Talmore does not support. Use a free, non-recurring, single-attendee event without proposals or Cal.com email verification.",
    );
  const unsupportedField = event.bookingFields.find(
    (field) =>
      !field.hidden &&
      field.required &&
      !["name", "email", "location", "rescheduleReason"].includes(field.field),
  );
  if (unsupportedField)
    throw new Error(
      `The Cal.com booking field "${unsupportedField.label || unsupportedField.slug || unsupportedField.field}" is required. Talmore cannot collect this field yet. Make it optional or hide it in your Cal.com event settings.`,
    );
  if (event.bookingFields.some(
    (field) => field.field === "name" && field.variant === "splitName",
  ))
    throw new Error(
      "This Cal.com event uses separate first and last name fields. Select the full-name format in your Cal.com event settings for Talmore booking.",
    );
  const location = event.locations[0];
  if (
    event.locations.length !== 1 ||
    !location ||
    !["integration", "link", "phone", "address"].includes(location.type)
  )
    throw new Error(
      "Choose one video, phone or in-person location in the Cal.com event.",
    );
  return location.type === "integration" || location.type === "link"
    ? "video"
    : location.type === "address"
      ? `address:${location.address}`
      : "phone";
}

export async function validateBookingPool(
  workspaceId: string,
  eventIds: string[],
) {
  const hosts = await loadInvitationHosts(workspaceId, eventIds);
  if (
    hosts.length !== eventIds.length ||
    hosts.some((host) => !host.event.webhookId)
  )
    throw new Error(
      "Every selected recruiter needs an active Cal.com connection with booking sync.",
    );
  const formats = await Promise.all(hosts.map(validatePoolHost));
  if (new Set(formats).size !== 1)
    throw new Error(
      "Use the same interview format for all recruiters, and the same address for in-person interviews.",
    );
  return formats[0]!;
}
