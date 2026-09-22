import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { databaseUuidSchema } from "@/lib/database-uuid";
import { db, emailOutbox } from "@harly/db";
import {
  applicationHasInterview,
  connectedBookingPool,
  loadActiveAutomationApplication,
} from "@/features/automations/candidate-messages";
import { manualBookingActorAllowed } from "@/lib/cal/invitation-access";
import { validateBookingPool } from "@/lib/cal/pool-hosts";
import {
  findBookingInvitation,
  manualInvitationSchema,
  saveManualBookingInvitation,
} from "./booking-invitations";

export const bulkBookingSchema = manualInvitationSchema
  .omit({
    applicationId: true,
    operation: true,
    expectedUpdatedAt: true,
    delivery: true,
  })
  .extend({ applicationIds: z.array(databaseUuidSchema).min(1).max(100) });
export type BulkBookingResult = {
  applicationId: string;
  status: "queued" | "skipped" | "failed";
  reason: string;
};

export async function inspectBulkBookingApplication(
  workspaceId: string,
  actorId: string,
  applicationId: string,
) {
  if (!(await manualBookingActorAllowed(workspaceId, actorId, applicationId)))
    return {
      applicationId,
      name: "Application unavailable",
      jobTitle: "",
      eligible: false,
      reason: "No access, or the application/job is inactive.",
    };
  const target = await loadActiveAutomationApplication(
    workspaceId,
    applicationId,
  );
  if (!target)
    return {
      applicationId,
      name: "Application unavailable",
      jobTitle: "",
      eligible: false,
      reason: "Application is no longer available.",
    };
  const reason = !target.candidate.email ? "Add an email address before sending a booking invitation." : (await applicationHasInterview(workspaceId, applicationId))
    ? "An interview already exists."
    : (await findBookingInvitation(workspaceId, applicationId))
      ? "Already has a booking invitation. Manage it individually."
      : "Ready to invite";
  return {
    applicationId,
    name: `${target.candidate.firstName} ${target.candidate.lastName}`,
    jobTitle: target.job.title,
    eligible: reason === "Ready to invite",
    reason,
  };
}

export async function sendBulkBookingInvitations(
  workspaceId: string,
  actorId: string,
  raw: unknown,
): Promise<BulkBookingResult[]> {
  const input = bulkBookingSchema.parse(raw);
  const events = await connectedBookingPool(workspaceId, input);
  const locationFormat = await validateBookingPool(
    workspaceId,
    events.map((event) => event.id),
  );
  const results: BulkBookingResult[] = [];
  for (const applicationId of new Set(input.applicationIds)) {
    try {
      // Recover a lost response without sending a second email for this batch/application.
      if (
        !(await manualBookingActorAllowed(workspaceId, actorId, applicationId))
      ) {
        results.push({
          applicationId,
          status: "skipped",
          reason: "No access, or the application/job is inactive.",
        });
        continue;
      }
      const existing = await findBookingInvitation(workspaceId, applicationId);
      if (existing) {
        const [prior] = await db
          .select({ id: emailOutbox.id, status: emailOutbox.status })
          .from(emailOutbox)
          .where(
            and(
              eq(emailOutbox.workspaceId, workspaceId),
              eq(emailOutbox.actorId, actorId),
              eq(
                emailOutbox.dedupeKey,
                `manual-booking:${existing.id}:${input.requestId}`,
              ),
            ),
          );
        results.push({
          applicationId,
          status: prior && prior.status !== "canceled" ? "queued" : "skipped",
          reason: prior
            ? prior.status === "sent"
              ? "Invitation sent"
              : prior.status === "canceled"
                ? "Invitation was canceled because it is no longer eligible."
                : "Invitation already queued"
            : "Already has a booking invitation. Manage it individually.",
        });
        continue;
      }
      const check = await inspectBulkBookingApplication(
        workspaceId,
        actorId,
        applicationId,
      );
      if (!check.eligible) {
        results.push({
          applicationId,
          status: "skipped",
          reason: check.reason,
        });
        continue;
      }
      await saveManualBookingInvitation(
        workspaceId,
        actorId,
        { ...input, applicationId, operation: "create", delivery: "email" },
        { events, locationFormat },
      );
      results.push({
        applicationId,
        status: "queued",
        reason: "Invitation queued",
      });
    } catch (error) {
      results.push({
        applicationId,
        status: "failed",
        reason:
          error instanceof Error
            ? error.message
            : "Could not queue the invitation.",
      });
    }
  }
  return results;
}
