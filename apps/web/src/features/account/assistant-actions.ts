"use server";

import { db, schema } from "@harly/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/features/workspaces/context";

export async function saveAssistantPersona(value: string) {
  const persona = z.enum(["maya", "leo"]).parse(value);
  const { user } = await getWorkspaceContext();
  await db
    .update(schema.user)
    .set({ assistantPersona: persona })
    .where(eq(schema.user.id, user.id));
  revalidatePath("/", "layout");
}
