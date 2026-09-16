"use server";
import { randomUUID } from "node:crypto";
import { db, workspaceSettings, metaConversionEvents } from "@harly/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "./permissions-server";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "@/lib/crypto";
import { getMetaStatus, sendMetaEvent } from "@/lib/meta/conversions";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { headers } from "next/headers";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { isIP } from "node:net";

const inputSchema = z.object({
  pixelId: z.union([z.literal(""), z.string().regex(/^\d{5,30}$/)]),
  enabled: z.boolean(),
  accessToken: z.string().trim().max(4096).default(""),
  removeToken: z.boolean().default(false),
  testEventCode: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9_-]*$/)
    .default(""),
});
export async function getMyWorkspaceMetaSettings() {
  const { organization } = await requirePermission("integrations:manage");
  return getMetaStatus(organization.id);
}

export async function saveWorkspaceMetaSettings(
  input: z.input<typeof inputSchema>,
) {
  const { organization } = await requirePermission("integrations:manage");
  const validation = inputSchema.safeParse(input);
  if (!validation.success)
    return {
      ok: false as const,
      message: "Enter a numeric Pixel ID and a valid token and test code.",
    };
  const parsed = validation.data;
  if ((parsed.accessToken || parsed.enabled) && !isEncryptionConfigured())
    return {
      ok: false as const,
      message:
        "Server encryption must be configured before enabling Conversions API.",
    };
  const result = await db.transaction(async (tx) => {
    await tx
      .insert(workspaceSettings)
      .values({ organizationId: organization.id })
      .onConflictDoNothing();
    const [current] = await tx
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, organization.id))
      .for("update");
    const changedDestination =
      current?.metaPixelId !== (parsed.pixelId || null);
    const token = parsed.removeToken
      ? null
      : parsed.accessToken
        ? encryptSecret(parsed.accessToken)
        : changedDestination
          ? null
          : (current?.metaCapiToken ?? null);
    if (changedDestination && parsed.enabled && !parsed.accessToken)
      return {
        ok: false as const,
        message: "Provide the access token for the new Pixel/Dataset ID.",
      };
    if (parsed.enabled && (!parsed.pixelId || !token))
      return {
        ok: false as const,
        message: "Conversions API requires a Pixel/Dataset ID and access token.",
      };
    await tx
      .update(workspaceSettings)
      .set({
        metaPixelId: parsed.pixelId || null,
        metaCapiToken: !parsed.pixelId ? null : token,
        metaCapiEnabled: parsed.enabled,
        metaTestEventCode: parsed.testEventCode || null,
      })
      .where(eq(workspaceSettings.organizationId, organization.id));
    if (!parsed.enabled || changedDestination || parsed.removeToken)
      await tx
        .update(metaConversionEvents)
        .set({
          status: "cancelled",
          payload: null,
          lastError: "Integration disabled or destination changed.",
        })
        .where(
          and(
            eq(metaConversionEvents.workspaceId, organization.id),
            eq(metaConversionEvents.status, "pending"),
          ),
        );
    return { ok: true as const };
  });
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/meta");
  return result;
}

export async function testWorkspaceMetaConnection() {
  const { organization } = await requirePermission("integrations:manage");
  try {
    await enforceRateLimit(`meta:test:${organization.id}`, {
      limit: 5,
      windowMs: 60_000,
    });
  } catch {
    return {
      ok: false,
      message: "Too many connection tests. Try again in a minute.",
    };
  }
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organization.id));
  if (
    !settings?.metaPixelId ||
    !settings.metaCapiToken ||
    !settings.metaTestEventCode
  )
    return {
      ok: false,
      message: "Save a Pixel ID, access token and Test Events code first.",
    };
  const origin = getHarlyPublicOrigin();
  if (!origin)
    return {
      ok: false,
      message: "Public application origin is not configured.",
    };
  const requestHeaders = new Headers(await headers());
  const ip = clientIp(new Request(origin, { headers: requestHeaders }));
  const result = await sendMetaEvent(
    settings.metaPixelId,
    decryptSecret(settings.metaCapiToken),
    {
      event_name: "HarlyConnectionTest",
      event_time: Math.floor(Date.now() / 1000),
      event_id: randomUUID(),
      action_source: "website",
      event_source_url: `${origin}/`,
      user_data: {
        client_user_agent:
          requestHeaders.get("user-agent")?.slice(0, 1024) ??
          "Harly connection test",
        ...(isIP(ip) ? { client_ip_address: ip } : {}),
      },
    },
    settings.metaTestEventCode,
  );
  return result.ok
    ? {
        ok: true,
        message:
          "Meta accepted the test event. Check Test Events in Events Manager.",
      }
    : { ok: false, message: result.error };
}
