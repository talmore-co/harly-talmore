import "server-only";

import { and, eq } from "drizzle-orm";
import { db, member, personalGoogleConnections } from "@harly/db";
import { decryptSecret } from "@/lib/crypto";
import { createOAuth2Client, type GCalConfig } from "./config";

export type PersonalGCalConfig = GCalConfig & {
  connectionId: string;
  availabilityCalendarIds: string[];
};

/** Never resolve a removed/inactive member's credentials. */
export async function getPersonalGCalConfig(
  workspaceId: string,
  selector: { userId: string } | { connectionId: string },
): Promise<PersonalGCalConfig | null> {
  const [result] = await db.select({ connection: personalGoogleConnections })
    .from(personalGoogleConnections)
    .innerJoin(member, and(
      eq(member.organizationId, personalGoogleConnections.workspaceId),
      eq(member.userId, personalGoogleConnections.userId),
      eq(member.status, "active"),
    ))
    .where(and(
      eq(personalGoogleConnections.workspaceId, workspaceId),
      "userId" in selector
        ? eq(personalGoogleConnections.userId, selector.userId)
        : eq(personalGoogleConnections.id, selector.connectionId),
      eq(personalGoogleConnections.enabled, true),
    )).limit(1);
  const row = result?.connection;
  if (!row?.refreshTokenCiphertext || !row.refreshTokenIv || !row.refreshTokenTag) return null;
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) return null;
  try {
    oauth2Client.setCredentials({ refresh_token: decryptSecret({
      ciphertext: row.refreshTokenCiphertext, iv: row.refreshTokenIv, tag: row.refreshTokenTag,
    }) });
    return {
      oauth2Client, connectionId: row.id, calendarId: row.calendarId,
      availabilityCalendarIds: row.availabilityCalendarIds,
    };
  } catch {
    return null;
  }
}

/** New interviews require the assigned person's connection, never the shared account. */
export async function getInterviewerGCalConfig(workspaceId: string, interviewerId?: string | null) {
  return interviewerId ? getPersonalGCalConfig(workspaceId, { userId: interviewerId }) : null;
}

export async function invalidatePersonalGCalConnection(workspaceId: string, connectionId: string) {
  await db.update(personalGoogleConnections).set({
    enabled: false, refreshTokenCiphertext: null, refreshTokenIv: null, refreshTokenTag: null,
    updatedAt: new Date(),
  }).where(and(eq(personalGoogleConnections.workspaceId, workspaceId), eq(personalGoogleConnections.id, connectionId)));
}
