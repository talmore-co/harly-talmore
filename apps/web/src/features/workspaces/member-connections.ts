import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  db,
  personalCalConnections,
  personalCalEvents,
  personalGoogleConnections,
  personalFathomConnections,
} from "@harly/db";
import { requirePermission } from "./permissions-server";

export type MemberConnectionStatus =
  | "Connected"
  | "Needs setup"
  | "Disconnected"
  | "Not connected";
export type MemberConnections = Record<
  "cal" | "google" | "fathom",
  MemberConnectionStatus
>;

/** Return setup states only, never account credentials or provider secrets. */
export async function getMemberConnectionStatuses(): Promise<
  Record<string, MemberConnections>
> {
  const { organization } = await requirePermission("members:read");
  const workspaceId = organization.id;
  const [cal, google, fathom] = await Promise.all([
    db
      .select({
        userId: personalCalConnections.userId,
        enabled: personalCalConnections.enabled,
        credential: isNotNull(personalCalConnections.apiKeyCiphertext),
        event: personalCalEvents.id,
        webhook: isNotNull(personalCalEvents.webhookId),
      })
      .from(personalCalConnections)
      .leftJoin(
        personalCalEvents,
        and(
          eq(personalCalEvents.connectionId, personalCalConnections.id),
          eq(
            personalCalEvents.eventTypeId,
            personalCalConnections.defaultEventTypeId,
          ),
        ),
      )
      .where(eq(personalCalConnections.workspaceId, workspaceId)),
    db
      .select({
        userId: personalGoogleConnections.userId,
        enabled: personalGoogleConnections.enabled,
        credential: isNotNull(personalGoogleConnections.refreshTokenCiphertext),
        calendar: personalGoogleConnections.calendarId,
      })
      .from(personalGoogleConnections)
      .where(eq(personalGoogleConnections.workspaceId, workspaceId)),
    db
      .select({
        userId: personalFathomConnections.userId,
        configured: sql<boolean>`${personalFathomConnections.apiKey} is not null or ${personalFathomConnections.secret} is not null or ${personalFathomConnections.webhookId} is not null or ${personalFathomConnections.setupPending}`,
        ready: sql<boolean>`${personalFathomConnections.apiKey} is not null and ${personalFathomConnections.secret} is not null and ${personalFathomConnections.webhookId} is not null and not ${personalFathomConnections.setupPending}`,
      })
      .from(personalFathomConnections)
      .where(eq(personalFathomConnections.workspaceId, workspaceId)),
  ]);
  const result: Record<string, MemberConnections> = {};
  const entry = (id: string) =>
    (result[id] ??= {
      cal: "Not connected",
      google: "Not connected",
      fathom: "Not connected",
    });
  for (const row of cal)
    entry(row.userId).cal =
      !row.enabled || !row.credential
        ? "Disconnected"
        : row.event && row.webhook
          ? "Connected"
          : "Needs setup";
  for (const row of google)
    entry(row.userId).google =
      !row.enabled || !row.credential
        ? "Disconnected"
        : row.calendar
          ? "Connected"
          : "Needs setup";
  for (const row of fathom)
    entry(row.userId).fathom = row.ready
      ? "Connected"
      : row.configured
        ? "Needs setup"
        : "Not connected";
  return result;
}
