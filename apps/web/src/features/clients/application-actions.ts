"use server";
import { and, desc, eq, sql } from "drizzle-orm";
import { activityEvents, applications, applicationStageHistory, clientOffers, clients, db, jobs, jobStages } from "@harly/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApplicationPermission, can } from "@/features/workspaces/permissions-server";
import { agencyDate, agencyApplicationId } from "./validation";

export async function getAgencyApplication(applicationId: string) {
  agencyApplicationId.parse(applicationId);
  const context = await requireApplicationPermission("candidates:view", applicationId);
  const [application] = await db.select({ id: applications.id, status: applications.status, hiredOn: applications.hiredOn, hireTerms: applications.hireTerms, clientId: jobs.clientId, clientName: clients.name })
    .from(applications).innerJoin(jobs, eq(jobs.id, applications.jobId)).leftJoin(clients, and(eq(clients.id, jobs.clientId), eq(clients.workspaceId, context.organization.id)))
    .where(and(eq(applications.id, applicationId), eq(applications.workspaceId, context.organization.id)));
  const [hireEvent] = await db.select({ at: applicationStageHistory.createdAt }).from(applicationStageHistory).innerJoin(jobStages, and(eq(jobStages.id, applicationStageHistory.toStageId), sql`lower(trim(${jobStages.name})) = 'hired'`))
    .where(and(eq(applicationStageHistory.applicationId, applicationId), eq(applicationStageHistory.workspaceId, context.organization.id))).orderBy(desc(applicationStageHistory.createdAt)).limit(1);
  const rows = await db.select({ id: clientOffers.id, offeredOn: clientOffers.offeredOn, status: clientOffers.status, terms: clientOffers.terms, clientName: clients.name }).from(clientOffers).innerJoin(clients, eq(clients.id, clientOffers.clientId))
    .where(and(eq(clientOffers.workspaceId, context.organization.id), eq(clientOffers.applicationId, applicationId))).orderBy(desc(clientOffers.offeredOn));
  return { ...application, hiredOn: application.hiredOn ?? (application.status === "hired" ? hireEvent?.at.toISOString().slice(0, 10) ?? null : null), offers: rows, workspaceId: context.organization.id, canEdit: await can("candidates:edit"), canManageOffers: await can("offers:manage") };
}

const offerSchema = z.object({
  id: z.uuid().optional(), applicationId: agencyApplicationId, offeredOn: agencyDate,
  status: z.enum(["pending", "accepted", "declined", "withdrawn"]), terms: z.string().trim().max(10000),
});
export async function recordClientOffer(input: z.input<typeof offerSchema>) {
  try {
    const values = offerSchema.parse(input);
    const { organization, user } = await requireApplicationPermission("offers:manage", values.applicationId);
    await db.transaction(async (tx) => {
      const [application] = await tx.select({ candidateId: applications.candidateId, jobId: applications.jobId, clientId: jobs.clientId }).from(applications).innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, organization.id)))
        .where(and(eq(applications.id, values.applicationId), eq(applications.workspaceId, organization.id))).for("update", { of: applications });
      if (!application) throw new Error("Application unavailable");
      if (values.id) {
        const [existing] = await tx.select().from(clientOffers).where(and(eq(clientOffers.id, values.id), eq(clientOffers.applicationId, values.applicationId), eq(clientOffers.workspaceId, organization.id))).for("update");
        if (!existing) throw new Error("Offer unavailable");
        await tx.update(clientOffers).set({ offeredOn: values.offeredOn, terms: values.terms, status: values.status, decidedAt: values.status === "pending" ? null : existing.status === values.status ? existing.decidedAt : new Date(), updatedAt: new Date() }).where(eq(clientOffers.id, existing.id));
      } else {
        if (!application.clientId) throw new Error("Link a client to the job first.");
        await tx.insert(clientOffers).values({ workspaceId: organization.id, applicationId: values.applicationId, candidateId: application.candidateId, jobId: application.jobId, clientId: application.clientId, offeredOn: values.offeredOn, terms: values.terms, status: values.status, decidedAt: values.status === "pending" ? null : new Date(), createdById: user.id });
      }
      await tx.insert(activityEvents).values({ workspaceId: organization.id, actorId: user.id, entityType: "application", entityId: values.applicationId, type: "client_offer.recorded", metadata: { status: values.status, offeredOn: values.offeredOn } });
    });
    revalidatePath("/dashboard/candidates", "layout"); revalidatePath("/dashboard");
    return { success: true };
  } catch { return { success: false, error: "Could not record the client offer. Check the fields, job’s client and your permissions." }; }
}
