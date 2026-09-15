import "server-only";

import { z } from "zod";
import { safeFetchHttp } from "@/lib/ssrf";
import { CAL_WEBHOOK_TRIGGERS } from "./client";

export async function personalCalFetch(
  apiKey: string,
  path: string,
  method = "GET",
  body?: unknown,
  version = "2024-06-14",
): Promise<unknown> {
  const response = await safeFetchHttp(`https://api.cal.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "cal-api-version": version,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as {
    status?: string;
    data?: unknown;
  } | null;
  if (!response.ok || json?.status === "error" || !json || !("data" in json)) {
    throw new Error(
      `Cal.com request failed (${response.status}). Check your API key and permissions.`,
    );
  }
  return json.data;
}

const profileSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  email: z.string().email(),
});
export async function getCalProfile(apiKey: string) {
  return profileSchema.parse(await personalCalFetch(apiKey, "/me"));
}

const eventSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  slug: z.string().min(1),
  lengthInMinutes: z.number().positive(),
  users: z.array(z.object({ id: z.number() })).optional(),
  ownerId: z.number().nullish(),
});
export type PersonalCalEvent = z.infer<typeof eventSchema> & {
  bookingUrl: string;
};

export async function listPersonalCalEvents(
  apiKey: string,
  profile: { id: number; username: string },
): Promise<PersonalCalEvent[]> {
  const raw = await personalCalFetch(
    apiKey,
    `/event-types?username=${encodeURIComponent(profile.username)}`,
  );
  const events = z.array(eventSchema).parse(raw);
  return events
    .filter(
      (event) =>
        (event.ownerId == null || event.ownerId === profile.id) &&
        (event.users?.length
          ? event.users.length === 1 && event.users[0]?.id === profile.id
          : event.ownerId === profile.id),
    )
    .map((event) => ({
      ...event,
      bookingUrl: `https://cal.com/${encodeURIComponent(profile.username)}/${encodeURIComponent(event.slug)}`,
    }));
}

export async function createPersonalCalEvent(
  apiKey: string,
  title: string,
  durationMins: number,
  slug: string,
) {
  return eventSchema.parse(
    await personalCalFetch(apiKey, "/event-types", "POST", {
      title,
      slug,
      lengthInMinutes: durationMins,
    }),
  );
}

const hookSchema = z.object({
  id: z.union([z.number(), z.string()]),
  subscriberUrl: z.string(),
});

/** Reconcile by our exact callback URL after timeouts, instead of duplicating hooks. */
export async function ensurePersonalCalWebhook(
  apiKey: string,
  eventTypeId: number,
  subscriberUrl: string,
  secret: string,
) {
  const path = `/event-types/${eventTypeId}/webhooks`;
  const existing = z
    .array(hookSchema)
    .parse(await personalCalFetch(apiKey, path));
  const own = existing.filter((hook) => hook.subscriberUrl === subscriberUrl);
  const body = {
    active: true,
    subscriberUrl,
    secret,
    triggers: [...CAL_WEBHOOK_TRIGGERS],
    version: "2021-10-20",
  };
  const hook = hookSchema.parse(
    await personalCalFetch(
      apiKey,
      own[0] ? `${path}/${encodeURIComponent(String(own[0].id))}` : path,
      own[0] ? "PATCH" : "POST",
      body,
    ),
  );
  for (const duplicate of own.slice(1)) {
    await personalCalFetch(
      apiKey,
      `${path}/${encodeURIComponent(String(duplicate.id))}`,
      "DELETE",
    );
  }
  return String(hook.id);
}

export async function removePersonalCalWebhook(
  apiKey: string,
  eventTypeId: number,
  subscriberUrl: string,
) {
  const path = `/event-types/${eventTypeId}/webhooks`;
  const hooks = z.array(hookSchema).parse(await personalCalFetch(apiKey, path));
  for (const hook of hooks.filter(
    (item) => item.subscriberUrl === subscriberUrl,
  )) {
    await personalCalFetch(
      apiKey,
      `${path}/${encodeURIComponent(String(hook.id))}`,
      "DELETE",
    );
  }
}

export const calBookingSchema = z.object({
  uid: z.string().min(1).max(200),
  title: z.string().max(500),
  status: z.enum(["accepted", "cancelled", "rejected", "pending"]),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).nullish(),
  createdAt: z.string().datetime({ offset: true }),
  eventTypeId: z.number().int().optional(),
  eventType: z.object({ id: z.number().int() }).optional(),
  hosts: z.array(z.object({ id: z.number().int() })),
  attendees: z.array(
    z.object({ name: z.string().max(500), email: z.string().email().max(320) }),
  ),
  location: z.string().max(2000).nullish(),
  meetingUrl: z.string().max(2000).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  rescheduledFromUid: z.string().max(200).nullish(),
  rescheduledToUid: z.string().max(200).nullish(),
});
export type PersonalCalBooking = z.infer<typeof calBookingSchema>;

export async function getPersonalCalBooking(apiKey: string, uid: string) {
  return calBookingSchema.parse(
    await personalCalFetch(
      apiKey,
      `/bookings/${encodeURIComponent(uid)}`,
      "GET",
      undefined,
      "2026-02-25",
    ),
  );
}
