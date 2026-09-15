import "server-only";

import { and, eq } from "drizzle-orm";
import { db, member, personalCalConnections } from "@harly/db";
import { decryptSecret } from "@/lib/crypto";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { cancelCalBooking } from "./client";

export function personalCalWebhookUrl(subscriptionId: string) {
  return `${getHarlyPublicOrigin()}/api/webhooks/cal/personal/${subscriptionId}`;
}

export async function getPersonalCalConnection(
  workspaceId: string,
  userId: string,
) {
  const [result] = await db
    .select({ connection: personalCalConnections })
    .from(personalCalConnections)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, personalCalConnections.workspaceId),
        eq(member.userId, personalCalConnections.userId),
        eq(member.status, "active"),
      ),
    )
    .where(
      and(
        eq(personalCalConnections.workspaceId, workspaceId),
        eq(personalCalConnections.userId, userId),
      ),
    )
    .limit(1);
  return result?.connection ?? null;
}

export function personalCalApiKey(
  connection: typeof personalCalConnections.$inferSelect,
) {
  if (
    !connection.enabled ||
    !connection.apiKeyCiphertext ||
    !connection.apiKeyIv ||
    !connection.apiKeyTag
  ) {
    throw new Error("Connect your Cal.com account first.");
  }
  return decryptSecret({
    ciphertext: connection.apiKeyCiphertext,
    iv: connection.apiKeyIv,
    tag: connection.apiKeyTag,
  });
}

/** Used by the authorized candidate-deletion workflow before database cascades. */
export async function cancelPersonalCalBookingForDeletion(
  workspaceId: string,
  connectionId: string,
  bookingUid: string,
) {
  try {
    const [connection] = await db
      .select()
      .from(personalCalConnections)
      .where(
        and(
          eq(personalCalConnections.workspaceId, workspaceId),
          eq(personalCalConnections.id, connectionId),
        ),
      )
      .limit(1);
    if (!connection) return false;
    return cancelCalBooking(
      {
        apiKey: personalCalApiKey(connection),
        baseUrl: "https://api.cal.com/v2",
        bookingUrl: null,
        defaultEventTypeId: null,
        webhookSecret: null,
      },
      bookingUid,
    );
  } catch {
    return false;
  }
}
