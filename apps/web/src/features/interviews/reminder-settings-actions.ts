"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db, workspaceSettings } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { interviewReminderSettingsSchema } from "./reminder-settings";

export async function saveInterviewReminderSettings(input: unknown) {
  const context = await requirePermission("settings:edit");
  const parsed = interviewReminderSettingsSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the reminder settings.",
    };
  const record = {
    settings: parsed.data,
    revision: randomUUID(),
    savedAt: new Date().toISOString(),
  };
  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      interviewReminders: record,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { interviewReminders: record, updatedAt: new Date() },
    });
  revalidatePath("/settings/interviews");
  return { ok: true as const };
}
