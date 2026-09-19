"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { clients, db, jobs } from "@harly/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission, requireJobPermission } from "@/features/workspaces/permissions-server";

const clientSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(200),
  website: z.union([z.literal(""), z.url().refine((url) => /^https?:\/\//i.test(url))]).default(""),
  notes: z.string().trim().max(10000).default(""),
  contacts: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.union([z.literal(""), z.email()]), phone: z.string().trim().max(80), role: z.string().trim().max(150) })).max(50),
});

export async function saveClient(input: z.input<typeof clientSchema>) {
  try {
    const { organization } = await requirePermission("clients:manage");
    const { id, ...values } = clientSchema.parse(input);
    const [row] = id ? await db.update(clients).set({ ...values, updatedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.workspaceId, organization.id))).returning({ id: clients.id })
      : await db.insert(clients).values({ ...values, workspaceId: organization.id }).returning({ id: clients.id });
    if (!row) return { success: false as const, error: "Client not found." };
    revalidatePath("/dashboard/clients", "layout");
    return { success: true as const, id: row.id };
  } catch { return { success: false as const, error: "Could not save client. Check the fields and your permissions." }; }
}

export async function archiveClient(id: string, archived: boolean) {
  try {
    const { organization } = await requirePermission("clients:manage");
    z.uuid().parse(id); z.boolean().parse(archived);
    const [row] = await db.update(clients).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.workspaceId, organization.id))).returning({ id: clients.id });
    if (!row) throw new Error("Not found");
    revalidatePath("/dashboard/clients", "layout");
    return { success: true };
  } catch { return { success: false, error: "Could not update client." }; }
}

export async function linkJobClient(jobId: string, clientId: string | null) {
  try {
    z.uuid().parse(jobId); z.uuid().nullable().parse(clientId);
    const context = await requirePermission("clients:manage");
    await requireJobPermission("jobs:edit", jobId, context);
    await db.transaction(async (tx) => {
      if (clientId) {
        const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.workspaceId, context.organization.id), isNull(clients.archivedAt))).for("share");
        if (!client) throw new Error("Client unavailable");
      }
      await tx.update(jobs).set({ clientId, updatedAt: new Date() }).where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, context.organization.id), isNull(jobs.deletedAt)));
    });
    revalidatePath("/dashboard/clients", "layout"); revalidatePath(`/dashboard/jobs/${jobId}`); revalidatePath("/dashboard/pipeline");
    return { success: true };
  } catch { return { success: false, error: "Could not link client. Check client status and job access." }; }
}

export async function listClientOptions() {
  const { organization } = await requirePermission("clients:view");
  return db.select({ id: clients.id, name: clients.name, archivedAt: clients.archivedAt }).from(clients).where(eq(clients.workspaceId, organization.id)).orderBy(asc(clients.name));
}
