import "server-only";
import { z } from "zod";
import { personalCalFetch } from "./personal-client";

const slotsSchema = z.record(
  z.string(),
  z.array(z.object({ start: z.string().datetime({ offset: true }) })),
);
export async function getPersonalCalSlots(
  apiKey: string,
  eventTypeId: number,
  start: Date,
  end: Date,
) {
  const query = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: "UTC",
  });
  const raw = await personalCalFetch(
    apiKey,
    `/slots?${query}`,
    "GET",
    undefined,
    "2024-09-04",
  );
  return Object.values(slotsSchema.parse(raw))
    .flat()
    .map((slot) => new Date(slot.start).toISOString());
}

/** Use the event's configured location. The API rejects unmet custom booking requirements. */
export async function createPersonalCalBooking(
  apiKey: string,
  input: {
    eventTypeId: number;
    start: string;
    attendee: {
      name: string;
      email: string;
      timeZone: string;
      phoneNumber?: string;
    };
    metadata: Record<string, string>;
  },
) {
  return z
    .object({
      uid: z.string().min(1).max(200),
      status: z.enum(["accepted", "pending"]),
    })
    .parse(
      await personalCalFetch(apiKey, "/bookings", "POST", input, "2024-08-13"),
    );
}

/** Positive matches only. An empty result never proves a timed-out write failed. */
export async function findPooledCalBooking(
  apiKey: string,
  eventTypeId: number,
  start: Date,
  durationMins: number,
  invitationId: string,
  requestId: string,
) {
  const pageSchema = z.object({
    data: z.array(
      z.object({
        uid: z.string(),
        metadata: z.record(z.string(), z.unknown()).nullish(),
      }),
    ),
    pagination: z.object({
      nextCursor: z.string().nullish(),
      hasMore: z.boolean(),
    }),
  });
  const query = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    afterStart: new Date(start.getTime() - 1000).toISOString(),
    beforeEnd: new Date(
      start.getTime() + durationMins * 60000 + 1000,
    ).toISOString(),
  });
  for (let page = 0; page < 5; page++) {
    const result = pageSchema.parse(
      await personalCalFetch(
        apiKey,
        `/bookings?${query}`,
        "GET",
        undefined,
        "2026-05-01",
        "envelope",
      ),
    );
    const matches = result.data.filter(
      (booking) =>
        booking.metadata?.talmoreInvitationId === invitationId &&
        booking.metadata?.talmoreBookingRequestId === requestId,
    );
    if (matches.length === 1) return matches[0]!.uid;
    if (
      matches.length > 1 ||
      !result.pagination.hasMore ||
      !result.pagination.nextCursor
    )
      return null;
    query.set("cursor", result.pagination.nextCursor);
  }
  return null;
}
