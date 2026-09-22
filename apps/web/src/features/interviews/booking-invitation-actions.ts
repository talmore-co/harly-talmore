"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  db,
  member,
  personalCalConnections,
  personalCalEvents,
  user,
} from "@harly/db";
import {
  requireApplicationPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import {
  applicationHasInterview,
  connectedBookingPool,
  loadActiveAutomationApplication,
} from "@/features/automations/candidate-messages";
import { bookingInvitationAllowed } from "@/lib/cal/invitation-access";
import { validateBookingPool } from "@/lib/cal/pool-hosts";
import {
  findBookingInvitation,
  invitationLink,
  manualInvitationSchema,
  saveManualBookingInvitation,
} from "./booking-invitations";
import { z } from "zod";
import { databaseUuidSchema } from "@/lib/database-uuid";
import {
  bulkBookingSchema,
  inspectBulkBookingApplication,
  sendBulkBookingInvitations,
} from "./bulk-booking-invitations";

export async function getBulkBookingInvitationOptions(
  applicationIds: string[],
) {
  const ids = z.array(databaseUuidSchema).min(1).max(100).parse(applicationIds);
  const context = await requirePermission("collab:write");
  const recipients = [];
  for (const id of new Set(ids))
    recipients.push(
      await inspectBulkBookingApplication(
        context.organization.id,
        context.user.id,
        id,
      ),
    );
  const first = recipients.find((row) => row.eligible);
  const options = first
    ? await getBookingInvitationOptions(first.applicationId)
    : null;
  return { recipients, options };
}

export async function sendBulkBookingInvitationAction(raw: unknown) {
  const input = bulkBookingSchema.safeParse(raw);
  if (!input.success)
    return {
      ok: false as const,
      error: "Select up to 100 applications and check the invitation message.",
    };
  const context = await requirePermission("collab:write");
  try {
    const results = await sendBulkBookingInvitations(
      context.organization.id,
      context.user.id,
      input.data,
    );
    revalidatePath("/dashboard/candidates");
    revalidatePath("/dashboard/pipeline");
    return { ok: true as const, results };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not send booking invitations.",
    };
  }
}

export async function getBookingInvitationOptions(applicationId: string) {
  const context = await requireApplicationPermission(
    "collab:write",
    applicationId,
  );
  const workspaceId = context.organization.id;
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      eventId: personalCalEvents.id,
      title: personalCalEvents.title,
      durationMins: personalCalEvents.durationMins,
      webhookId: personalCalEvents.webhookId,
      enabled: personalCalConnections.enabled,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(
      personalCalConnections,
      and(
        eq(personalCalConnections.workspaceId, workspaceId),
        eq(personalCalConnections.userId, user.id),
      ),
    )
    .leftJoin(
      personalCalEvents,
      and(
        eq(personalCalEvents.connectionId, personalCalConnections.id),
        eq(
          personalCalEvents.eventTypeId,
          personalCalConnections.defaultEventTypeId,
        ),
      ),
    )
    .where(
      and(eq(member.organizationId, workspaceId), eq(member.status, "active")),
    )
    .orderBy(user.name);
  const invitation = await findBookingInvitation(workspaceId, applicationId);
  const target = await loadActiveAutomationApplication(
    workspaceId,
    applicationId,
  );
  const canInvite = Boolean(
    target?.candidate.email && !(await applicationHasInterview(workspaceId, applicationId)),
  );
  // Resolve saved events too: a recruiter's default can have changed since creation.
  const savedHosts = invitation
    ? await db
        .select({
          userId: personalCalConnections.userId,
          eventId: personalCalEvents.id,
        })
        .from(personalCalEvents)
        .innerJoin(
          personalCalConnections,
          eq(personalCalConnections.id, personalCalEvents.connectionId),
        )
        .where(eq(personalCalConnections.workspaceId, workspaceId))
    : [];
  return {
    currentUserId: context.user.id,
    canInvite,
    cannotInviteReason: target && !target.candidate.email ? "Add an email address to this candidate before creating a booking invitation." : null,
    members: rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      durationMins: row.durationMins,
      title: row.title,
      ready: Boolean(row.enabled && row.webhookId),
    })),
    invitation: invitation
      ? {
          id: invitation.id,
          interviewerIds: savedHosts
            .filter((host) => invitation.eventIds.includes(host.eventId))
            .map((host) => host.userId),
          interviewType: invitation.interviewType,
          state: invitation.bookingState,
          durationMins: invitation.durationMins,
          locationFormat: invitation.locationFormat,
          updatedAt: invitation.updatedAt.toISOString(),
          expiresAt: invitation.expiresAt?.toISOString(),
          source: invitation.workflowId
            ? ("automation" as const)
            : ("manual" as const),
          available: Boolean(
            canInvite &&
            invitation.expiresAt &&
            invitation.expiresAt.getTime() > Date.now() &&
            invitation.stageId === target?.application.currentStageId &&
            (await bookingInvitationAllowed(invitation)),
          ),
        }
      : null,
  };
}

export async function previewBookingInvitationPool(
  applicationId: string,
  interviewerIds: string[],
) {
  const context = await requireApplicationPermission(
    "collab:write",
    applicationId,
  );
  try {
    const events = await connectedBookingPool(context.organization.id, {
      interviewerIds,
    });
    const locationFormat = await validateBookingPool(
      context.organization.id,
      events.map((event) => event.id),
    );
    return {
      ok: true as const,
      durationMins: events[0]!.durationMins,
      locationFormat,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not validate the selected events.",
    };
  }
}

export async function createManualBookingInvitation(raw: unknown) {
  const parsed = manualInvitationSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "Check the interviewers and invitation message.",
    };
  const context = await requireApplicationPermission(
    "collab:write",
    parsed.data.applicationId,
  );
  try {
    const { invitation, outboxId } = await saveManualBookingInvitation(
      context.organization.id,
      context.user.id,
      parsed.data,
    );
    revalidatePath("/dashboard/candidates");
    // The scheduler delivers the durable outbox; copying never queues an email.
    return {
      ok: true as const,
      url: parsed.data.delivery === "copy" ? invitationLink(invitation) : null,
      queued: Boolean(outboxId),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not create the booking invitation.",
    };
  }
}
