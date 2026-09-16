"use server";
import { db, workspaceSettings } from "@harly/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "./permissions-server";

export async function getMyWorkspaceMetaPixel() {
  const context = await requirePermission("integrations:manage");
  const [settings] = await db
    .select({ pixelId: workspaceSettings.metaPixelId })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id));
  return settings?.pixelId ?? "";
}
export async function saveWorkspaceMetaPixel(value: string) {
  const context = await requirePermission("integrations:manage");
  const pixelId = z
    .union([z.literal(""), z.string().regex(/^\d{5,30}$/)])
    .parse(value.trim());
  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      metaPixelId: pixelId || null,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { metaPixelId: pixelId || null },
    });
  revalidatePath("/settings/integrations");
}
