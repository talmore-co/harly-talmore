"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, personalGoogleConnections } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { createOAuth2Client } from "@/lib/gcal/config";
import { isEncryptionConfigured } from "@/lib/crypto";
import { listCalendars } from "@/lib/gcal/client";
import { getPersonalGCalConfig, invalidatePersonalGCalConnection } from "@/lib/gcal/personal";

export async function getMyGoogleConnection() {
  const context = await getWorkspaceContext();
  const [row] = await db.select({
    accountEmail: personalGoogleConnections.accountEmail,
    calendarId: personalGoogleConnections.calendarId,
    availabilityCalendarIds: personalGoogleConnections.availabilityCalendarIds,
    enabled: personalGoogleConnections.enabled,
  }).from(personalGoogleConnections).where(and(
    eq(personalGoogleConnections.workspaceId, context.organization.id),
    eq(personalGoogleConnections.userId, context.user.id),
  )).limit(1);
  return {
    workspaceId: context.organization.id,
    configured: Boolean(createOAuth2Client()) && isEncryptionConfigured(),
    connection: row ?? null,
  };
}

export async function listMyGoogleCalendars() {
  const context = await getWorkspaceContext();
  const config = await getPersonalGCalConfig(context.organization.id, { userId: context.user.id });
  if (!config) return { ok: false as const, error: "Connect your Google account first." };
  try {
    const calendars = await listCalendars(config.oauth2Client, false);
    return { ok: true as const, calendars: calendars.map((calendar) => ({
      id: calendar.id, name: calendar.summary,
      writable: ["owner", "writer", "writerWithoutPrivateAccess"].includes(calendar.accessRole),
    })) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      await invalidatePersonalGCalConnection(context.organization.id, config.connectionId);
    }
    return { ok: false as const, error: "Could not access Google Calendar. Reconnect your account and try again." };
  }
}

const settingsSchema = z.object({
  calendarId: z.string().trim().min(1).max(1024),
  availabilityCalendarIds: z.array(z.string().min(1).max(1024)).min(1).max(50),
});

export async function saveMyGoogleCalendars(
  input: z.infer<typeof settingsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await getWorkspaceContext();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Select an interview calendar and at least one availability calendar." };
  const config = await getPersonalGCalConfig(context.organization.id, { userId: context.user.id });
  if (!config) return { ok: false, error: "Connect your Google account first." };
  try {
    const calendars = await listCalendars(config.oauth2Client, false);
    if (!calendars.some((c) => c.id === parsed.data.calendarId && ["owner", "writer", "writerWithoutPrivateAccess"].includes(c.accessRole)) ||
        parsed.data.availabilityCalendarIds.some((id) => !calendars.some((c) => c.id === id))) {
      return { ok: false, error: "Choose calendars available to your connected account. The interview calendar must be writable." };
    }
    await db.update(personalGoogleConnections).set({
      calendarId: parsed.data.calendarId,
      availabilityCalendarIds: [...new Set([parsed.data.calendarId, ...parsed.data.availabilityCalendarIds])],
      updatedAt: new Date(),
    }).where(and(
      eq(personalGoogleConnections.workspaceId, context.organization.id),
      eq(personalGoogleConnections.userId, context.user.id),
      eq(personalGoogleConnections.id, config.connectionId),
    ));
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save calendars. Check your Google connection and try again." };
  }
}

export async function disconnectMyGoogleConnection() {
  const context = await getWorkspaceContext();
  // Remove only this member's local credentials. Revoking a Google grant can
  // also invalidate the same account's existing workspace connection.
  await db.update(personalGoogleConnections).set({
    enabled: false, refreshTokenCiphertext: null, refreshTokenIv: null, refreshTokenTag: null,
    updatedAt: new Date(),
  }).where(and(
    eq(personalGoogleConnections.workspaceId, context.organization.id),
    eq(personalGoogleConnections.userId, context.user.id),
  ));
  return { ok: true };
}
