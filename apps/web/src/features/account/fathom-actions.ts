"use server";

import { and, eq, isNull, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, personalFathomConnections, interviewRecordings } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requireInterviewPermission } from "@/features/workspaces/permissions-server";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "@/lib/crypto";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import {
  createFathomWebhook,
  deleteFathomWebhook,
  FathomApiError,
} from "@/lib/fathom/client";

type Result = { ok: true } | { ok: false; error: string };
const incompleteMessage =
  "Fathom setup did not finish. Check Fathom settings for a webhook using the destination URL below before resetting setup.";

export async function getMyFathomConnection() {
  const { organization, user } = await getWorkspaceContext();
  const [connection] = await db
    .select()
    .from(personalFathomConnections)
    .where(
      and(
        eq(personalFathomConnections.workspaceId, organization.id),
        eq(personalFathomConnections.userId, user.id),
      ),
    );
  return {
    configured: isEncryptionConfigured(),
    enabled: Boolean(connection?.secret),
    recorderEmail: connection?.recorderEmail ?? null,
    setupPending: connection?.setupPending ?? false,
    cleanupPending: Boolean(connection?.webhookId && !connection.secret),
    callbackUrl: connection
      ? `${getHarlyPublicOrigin()}/api/webhooks/fathom/${connection.id}`
      : null,
    lastImportedAt: connection?.lastImportedAt?.toISOString() ?? null,
  };
}

export async function connectMyFathomAccount(input: {
  apiKey: string;
}): Promise<Result> {
  const { organization, user } = await getWorkspaceContext();
  const parsed = z
    .object({ apiKey: z.string().trim().min(10).max(1000) })
    .safeParse(input);
  if (!parsed.success || !isEncryptionConfigured())
    return {
      ok: false,
      error: "Enter a Fathom API key. Server encryption must be configured.",
    };
  const callbackOrigin = getHarlyPublicOrigin();
  await db
    .insert(personalFathomConnections)
    .values({ workspaceId: organization.id, userId: user.id })
    .onConflictDoNothing();
  // Commit the reservation before the remote call. A crash cannot silently create a second hook on retry.
  const reservation = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(personalFathomConnections)
      .where(
        and(
          eq(personalFathomConnections.workspaceId, organization.id),
          eq(personalFathomConnections.userId, user.id),
        ),
      )
      .for("update");
    if (connection.secret) return { result: { ok: true } as Result };
    if (connection.setupPending || connection.webhookId)
      return { result: { ok: false, error: incompleteMessage } as Result };
    const apiKey = encryptSecret(parsed.data.apiKey);
    await tx
      .update(personalFathomConnections)
      .set({
        apiKey,
        setupPending: true,
        recorderEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(personalFathomConnections.id, connection.id));
    return { id: connection.id, version: apiKey.iv };
  });
  if (reservation.result) return reservation.result;
  try {
    return await db.transaction(async (tx) => {
      const [connection] = await tx
        .select()
        .from(personalFathomConnections)
        .where(eq(personalFathomConnections.id, reservation.id!))
        .for("update");
      if (
        !connection?.setupPending ||
        connection.apiKey?.iv !== reservation.version
      )
        return {
          ok: false,
          error: "Fathom setup was canceled. Please try again.",
        };
      // Hold the connection lock through registration and persistence, including disconnect races.
      try {
        const hook = await createFathomWebhook(
          parsed.data.apiKey,
          `${callbackOrigin}/api/webhooks/fathom/${connection.id}`,
        );
        await tx
          .update(personalFathomConnections)
          .set({
            webhookId: hook.id,
            secret: encryptSecret(hook.secret),
            setupPending: false,
            updatedAt: new Date(),
          })
          .where(eq(personalFathomConnections.id, connection.id));
        return { ok: true };
      } catch (error) {
        // These definite rejections cannot have created a webhook. Network/5xx failures remain reserved.
        if (
          error instanceof FathomApiError &&
          [400, 401, 403, 404, 422, 429].includes(error.status)
        ) {
          await tx
            .update(personalFathomConnections)
            .set({ apiKey: null, setupPending: false, updatedAt: new Date() })
            .where(eq(personalFathomConnections.id, connection.id));
          return {
            ok: false,
            error:
              error.status === 429
                ? "Fathom is rate-limiting requests. Wait a moment and try again."
                : "Fathom could not create the webhook. Check that your personal API key is active and has access.",
          };
        }
        return { ok: false, error: incompleteMessage };
      }
    });
  } catch {
    return { ok: false, error: incompleteMessage };
  }
}

export async function disconnectMyFathomConnection(): Promise<Result> {
  const { organization, user } = await getWorkspaceContext();
  // Stop imports first, even if Fathom is unavailable. Keep credentials only while cleanup is pending.
  await db
    .update(personalFathomConnections)
    .set({ secret: null, updatedAt: new Date() })
    .where(
      and(
        eq(personalFathomConnections.workspaceId, organization.id),
        eq(personalFathomConnections.userId, user.id),
      ),
    );
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(personalFathomConnections)
      .where(
        and(
          eq(personalFathomConnections.workspaceId, organization.id),
          eq(personalFathomConnections.userId, user.id),
        ),
      )
      .for("update");
    if (!connection) return { ok: true };
    if (connection.setupPending) return { ok: false, error: incompleteMessage };
    if (connection.webhookId) {
      try {
        if (!connection.apiKey) throw new Error("Missing credentials");
        await deleteFathomWebhook(
          decryptSecret(connection.apiKey),
          connection.webhookId,
        );
      } catch {
        return {
          ok: false,
          error:
            "Imports are stopped, but Fathom could not remove the webhook. Retry disconnect to finish cleanup.",
        };
      }
    }
    await tx
      .update(personalFathomConnections)
      .set({
        secret: null,
        apiKey: null,
        webhookId: null,
        recorderEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(personalFathomConnections.id, connection.id));
    return { ok: true };
  });
}

/** Recovery after the user removes an incomplete or inaccessible remote webhook. */
export async function resetIncompleteFathomSetup(input: {
  removedWebhook: boolean;
}): Promise<Result> {
  const { organization, user } = await getWorkspaceContext();
  if (input?.removedWebhook !== true)
    return {
      ok: false,
      error:
        "Remove any webhook for this destination in Fathom before resetting.",
    };
  await db
    .update(personalFathomConnections)
    .set({
      apiKey: null,
      webhookId: null,
      setupPending: false,
      recorderEmail: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(personalFathomConnections.workspaceId, organization.id),
        eq(personalFathomConnections.userId, user.id),
        isNull(personalFathomConnections.secret),
        or(
          eq(personalFathomConnections.setupPending, true),
          isNotNull(personalFathomConnections.webhookId),
        ),
      ),
    );
  return { ok: true };
}

export async function getInterviewRecordings(interviewId: string) {
  z.string().uuid().parse(interviewId);
  const { organization } = await requireInterviewPermission(
    "candidates:view",
    interviewId,
  );
  return db
    .select({
      id: interviewRecordings.id,
      recordingUrl: interviewRecordings.recordingUrl,
      summary: interviewRecordings.summary,
      transcript: interviewRecordings.transcript,
    })
    .from(interviewRecordings)
    .where(
      and(
        eq(interviewRecordings.workspaceId, organization.id),
        eq(interviewRecordings.interviewId, interviewId),
        eq(interviewRecordings.provider, "fathom"),
      ),
    );
}
