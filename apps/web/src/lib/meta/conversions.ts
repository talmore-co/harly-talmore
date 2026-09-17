import "server-only";
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  workspaceSettings,
  metaConversionEvents,
  applications,
  candidates,
  jobs,
} from "@harly/db";
import {
  encryptSecret,
  decryptSecret,
  isEncryptionConfigured,
} from "@/lib/crypto";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import type { MetaRequestContext } from "./request-context";
import { hashedMetaContact } from "./matching";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const META_GRAPH_VERSION = "v25.0";

export async function getMetaStatus(workspaceId: string) {
  const [settings] = await db
    .select({
      pixelId: workspaceSettings.metaPixelId,
      enabled: workspaceSettings.metaCapiEnabled,
      token: workspaceSettings.metaCapiToken,
      testEventCode: workspaceSettings.metaTestEventCode,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId));
  const recent = await db
    .select({
      id: metaConversionEvents.id,
      eventName: metaConversionEvents.eventName,
      status: metaConversionEvents.status,
      attempts: metaConversionEvents.attempts,
      eventTime: metaConversionEvents.eventTime,
      deliveredAt: metaConversionEvents.deliveredAt,
      lastError: metaConversionEvents.lastError,
      test: metaConversionEvents.testEventCode,
    })
    .from(metaConversionEvents)
    .where(eq(metaConversionEvents.workspaceId, workspaceId))
    .orderBy(desc(metaConversionEvents.eventTime))
    .limit(10);
  return {
    pixelId: settings?.pixelId ?? "",
    enabled: settings?.enabled ?? false,
    hasToken: Boolean(settings?.token),
    testEventCode: settings?.testEventCode ?? "",
    encryptionReady: isEncryptionConfigured(),
    recent: recent.map((row) => ({
      ...row,
      test: Boolean(row.test),
      eventTime: row.eventTime.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
    })),
  };
}

/** Transactional outbox: no network calls can delay or reject the application. */
export async function enqueueMetaConversions(
  tx: Transaction,
  input: {
    workspaceId: string;
    applicationId: string;
    jobId: string;
    jobSlug: string;
    workspaceSlug?: string;
    qualified: boolean;
    context: MetaRequestContext;
    contact?: { email?: string | null; phone?: string | null };
  },
) {
  if (!isEncryptionConfigured()) return;
  const origin = getHarlyPublicOrigin();
  if (!origin) return;
  const [settings] = await tx
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, input.workspaceId))
    .for("share");
  if (
    !settings?.metaCapiEnabled ||
    !settings.metaPixelId ||
    !settings.metaCapiToken
  )
    return;
  const eventTime = new Date();
  const names = input.qualified
    ? ["SubmitApplication", "QualifiedApplication"]
    : ["SubmitApplication"];
  await tx
    .insert(metaConversionEvents)
    .values(
      names.map((eventName) => {
        const eventId =
          eventName === "QualifiedApplication"
            ? `${input.applicationId}:qualified`
            : input.applicationId;
        return {
          workspaceId: input.workspaceId,
          applicationId: input.applicationId,
          pixelId: settings.metaPixelId!,
          eventName,
          eventId,
          eventTime,
          testEventCode: settings.metaTestEventCode,
          payload: encryptSecret(
            JSON.stringify({
              event_name: eventName,
              event_id: eventId,
              event_time: Math.floor(eventTime.getTime() / 1000),
              action_source: "website",
              event_source_url: `${origin}${input.workspaceSlug ? `/board/${encodeURIComponent(input.workspaceSlug)}` : ""}/apply/${encodeURIComponent(input.jobSlug)}`,
              user_data: { ...input.context, ...hashedMetaContact(input.contact ?? {}) },
              custom_data: { content_ids: [input.jobId] },
            }),
          ),
        };
      }),
    )
    .onConflictDoNothing();
}

export async function sendMetaEvent(
  pixelId: string,
  token: string,
  event: unknown,
  testEventCode?: string | null,
) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: [event],
          ...(testEventCode ? { test_event_code: testEventCode } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      events_received?: number;
      error?: { code?: number; is_transient?: boolean };
    } | null;
    if (response.ok && body?.events_received === 1)
      return { ok: true as const };
    // Never store raw provider error messages: these can echo credentials or event data.
    const code = typeof body?.error?.code === "number" ? body.error.code : null;
    return {
      ok: false as const,
      retry:
        response.status === 429 ||
        response.status >= 500 ||
        body?.error?.is_transient === true ||
        [1, 2, 4, 17, 32, 613].includes(code ?? 0),
      error: `Meta rejected event (HTTP ${response.status}${code ? `, code ${code}` : ""}).`,
    };
  } catch {
    return {
      ok: false as const,
      retry: true,
      error: "Meta request failed or timed out.",
    };
  }
}

/** Short row-lock transaction claims a two-minute lease before any network call. */
export async function dispatchMetaConversions() {
  const results = await Promise.all(
    Array.from({ length: 5 }, async () => {
      const claim = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(metaConversionEvents)
          .where(
            and(
              eq(metaConversionEvents.status, "pending"),
              lte(metaConversionEvents.nextAttemptAt, new Date()),
            ),
          )
          .orderBy(asc(metaConversionEvents.nextAttemptAt))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!row) return "idle";
        const [settings] = await tx
          .select()
          .from(workspaceSettings)
          .where(eq(workspaceSettings.organizationId, row.workspaceId))
          .for("share", { skipLocked: true });
        if (!settings) return "idle";
        const [live] = await tx
          .select({ id: applications.id })
          .from(applications)
          .innerJoin(candidates, eq(candidates.id, applications.candidateId))
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .where(
            and(
              eq(applications.id, row.applicationId),
              eq(applications.workspaceId, row.workspaceId),
              isNull(candidates.deletedAt),
              isNull(jobs.deletedAt),
            ),
          );
        // Stay inside Meta's browser/server deduplication window.
        const expired = Date.now() - row.eventTime.getTime() > 47 * 3600_000;
        if (
          !live ||
          !settings?.metaCapiEnabled ||
          settings.metaPixelId !== row.pixelId ||
          !settings.metaCapiToken ||
          !row.payload ||
          expired ||
          row.attempts >= 10
        ) {
          await tx
            .update(metaConversionEvents)
            .set({
              status: "cancelled",
              payload: null,
              lastError: expired
                ? "Event expired before delivery."
                : "Integration disabled, destination changed or application removed.",
            })
            .where(eq(metaConversionEvents.id, row.id));
          return "cancelled";
        }
        const attempts = row.attempts + 1;
        await tx
          .update(metaConversionEvents)
          .set({ attempts, nextAttemptAt: new Date(Date.now() + 120_000) })
          .where(eq(metaConversionEvents.id, row.id));
        return { row, token: settings.metaCapiToken, attempts };
      });
      if (typeof claim === "string") return claim;
      const { row, token, attempts } = claim;
      // A disconnect can cancel a lease before sending; an already in-flight
      // HTTP request cannot be retracted. Its completion must not undo cancellation.
      const active = and(
        eq(metaConversionEvents.id, row.id),
        eq(metaConversionEvents.status, "pending"),
        eq(metaConversionEvents.attempts, attempts),
      );
      const [current] = await db
        .select({ id: metaConversionEvents.id })
        .from(metaConversionEvents)
        .where(active);
      if (!current) return "cancelled";
      let result: Awaited<ReturnType<typeof sendMetaEvent>>;
      try {
        result = await sendMetaEvent(
          row.pixelId,
          decryptSecret(token),
          JSON.parse(decryptSecret(row.payload!)),
          row.testEventCode,
        );
      } catch {
        result = {
          ok: false,
          retry: false,
          error:
            "Unable to decrypt Meta credentials or event. Check server encryption configuration.",
        };
      }
      const retry = !result.ok && result.retry && attempts < 10;
      await db
        .update(metaConversionEvents)
        .set({
          status: result.ok ? "delivered" : retry ? "pending" : "failed",
          attempts,
          payload: retry ? row.payload : null,
          deliveredAt: result.ok ? new Date() : null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(6 * 3600_000, 60_000 * 2 ** attempts),
          ),
          lastError: result.ok ? null : result.error,
        })
        .where(active);
      return result.ok ? "delivered" : retry ? "retrying" : "failed";
    }),
  );
  await db
    .delete(metaConversionEvents)
    .where(sql`${metaConversionEvents.eventTime} < now() - interval '30 days'`);
  return {
    processed: results.filter((result) => result !== "idle").length,
    delivered: results.filter((result) => result === "delivered").length,
    failed: results.filter((result) => result === "failed").length,
  };
}
