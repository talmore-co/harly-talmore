import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { databaseUuidSchema } from "@/lib/database-uuid";
import {
  activityEvents,
  applications,
  automationBookingInvitations,
  db,
  emailOutbox,
} from "@harly/db";
import {
  applicationHasInterview,
  connectedBookingPool,
  loadActiveAutomationApplication,
} from "@/features/automations/candidate-messages";
import {
  renderWorkflowText,
  workflowTextHtml,
} from "@/features/automations/message-template";
import {
  bookingInvitationAllowed,
  manualBookingActorAllowed,
} from "@/lib/cal/invitation-access";
import { loadInvitationHosts, validateBookingPool } from "@/lib/cal/pool-hosts";
import { signBookingInvitation } from "@/lib/cal/invitation-token";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const manualInvitationSchema = z.object({
  applicationId: databaseUuidSchema,
  interviewerIds: z.array(z.string().min(1)).min(1).max(10),
  interviewType: z.enum([
    "screening",
    "technical",
    "culture_fit",
    "onsite",
    "final",
  ]),
  // Existing invitations must be explicitly reused or updated, never silently replaced.
  operation: z.enum(["create", "reuse", "update"]),
  expectedUpdatedAt: z.string().datetime().optional(),
  delivery: z.enum(["copy", "email"]),
  requestId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

export function invitationLink(
  invitation: typeof automationBookingInvitations.$inferSelect,
) {
  if (!invitation.tokenSecret)
    throw new Error("This invitation has no booking link.");
  return `${getHarlyPublicOrigin()}/book/interview#${signBookingInvitation(invitation.id, invitation.tokenSecret)}`;
}

export async function findBookingInvitation(
  workspaceId: string,
  applicationId: string,
) {
  const [invitation] = await db
    .select()
    .from(automationBookingInvitations)
    .where(
      and(
        eq(automationBookingInvitations.workspaceId, workspaceId),
        eq(automationBookingInvitations.applicationId, applicationId),
        isNotNull(automationBookingInvitations.tokenSecret),
      ),
    );
  return invitation ?? null;
}

function renderMessage(
  subject: string,
  body: string,
  target: NonNullable<
    Awaited<ReturnType<typeof loadActiveAutomationApplication>>
  >,
) {
  const allowed = new Set([
    "candidate.firstName",
    "candidate.lastName",
    "job.title",
  ]);
  for (const text of [subject, body])
    for (const match of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g))
      if (!allowed.has(match[1]!))
        throw new Error(`Unknown message variable: ${match[1]}`);
  const context = {
    candidate: {
      firstName: target.candidate.firstName,
      lastName: target.candidate.lastName,
    },
    job: { title: target.job.title },
  };
  return {
    subject: renderWorkflowText(subject, context),
    text: renderWorkflowText(body, context),
  };
}

export async function saveManualBookingInvitation(
  workspaceId: string,
  actorId: string,
  raw: unknown,
  validatedPool?: {
    events: Awaited<ReturnType<typeof connectedBookingPool>>;
    locationFormat: string;
  },
) {
  const input = manualInvitationSchema.parse(raw);
  if (
    !(await manualBookingActorAllowed(
      workspaceId,
      actorId,
      input.applicationId,
    ))
  )
    throw new Error("You do not have access to schedule this application.");
  const target = await loadActiveAutomationApplication(
    workspaceId,
    input.applicationId,
  );
  if (target && !target.candidate.email) throw new Error("Add an email address to this candidate before creating a booking invitation.");
  if (
    !target ||
    (await applicationHasInterview(workspaceId, input.applicationId))
  )
    throw new Error(
      "This application is not available for a new booking invitation.",
    );
  renderMessage(input.subject, input.body, target);
  // Remote validation stays outside the transaction; compare the saved snapshot under lock.
  const events =
    input.operation === "reuse"
      ? null
      : (validatedPool?.events ??
        (await connectedBookingPool(workspaceId, input)));
  const locationFormat = events
    ? (validatedPool?.locationFormat ??
      (await validateBookingPool(
        workspaceId,
        events.map((event) => event.id),
      )))
    : null;
  const before = await findBookingInvitation(workspaceId, input.applicationId);
  if (
    input.operation === "reuse" &&
    (!before || !(await bookingInvitationAllowed(before)))
  )
    throw new Error(
      "This invitation is paused or no longer available. Update it to create a manual invitation.",
    );
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`pooled-booking:${input.applicationId}`}, 0))`,
    );
    const [app] = await tx
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, input.applicationId),
        ),
      )
      .for("update");
    if (
      !app ||
      app.status !== "active" ||
      app.currentStageId !== target.application.currentStageId
    )
      throw new Error(
        "The application changed. Reopen scheduling and try again.",
      );
    const [existing] = await tx
      .select()
      .from(automationBookingInvitations)
      .where(
        and(
          eq(automationBookingInvitations.workspaceId, workspaceId),
          eq(automationBookingInvitations.applicationId, input.applicationId),
          isNotNull(automationBookingInvitations.tokenSecret),
        ),
      )
      .for("update");
    if (
      existing &&
      (input.operation === "create" ||
        existing.updatedAt.toISOString() !== input.expectedUpdatedAt)
    )
      throw new Error(
        "A booking invitation already exists or changed. Reload it before continuing.",
      );
    if (!existing && input.operation !== "create")
      throw new Error("Invitation not found. Reopen scheduling.");
    if (existing && existing.bookingState !== "open")
      throw new Error(
        "This invitation is already booked, canceled or being confirmed.",
      );
    if (await applicationHasInterview(workspaceId, input.applicationId))
      throw new Error("An interview already exists for this application.");
    let invitation = existing;
    if (input.operation !== "reuse") {
      const values = {
        workflowId: null,
        outboxId: null,
        createdById: actorId,
        definitionVersion: null,
        stageId: app.currentStageId!,
        eventIds: events!.map((event) => event.id),
        durationMins: events![0]!.durationMins,
        locationFormat,
        interviewType: input.interviewType,
        expiresAt: new Date(Date.now() + 90 * 86400000),
        updatedAt: new Date(),
      };
      [invitation] = existing
        ? await tx
            .update(automationBookingInvitations)
            .set({ ...values, revision: existing.revision + 1 })
            .where(eq(automationBookingInvitations.id, existing.id))
            .returning()
        : await tx
            .insert(automationBookingInvitations)
            .values({
              ...values,
              workspaceId,
              applicationId: app.id,
              tokenSecret: randomBytes(32).toString("hex"),
            })
            .onConflictDoNothing()
            .returning();
      if (!invitation)
        throw new Error(
          "Another booking invitation was created. Reload scheduling.",
        );
      await tx.insert(activityEvents).values({
        workspaceId,
        entityType: "application",
        entityId: app.id,
        actorId,
        type: existing
          ? "booking_invitation.updated"
          : "booking_invitation.created",
        metadata: {
          invitationId: invitation.id,
          interviewType: input.interviewType,
          interviewerIds: input.interviewerIds,
        },
      });
    }
    if (
      !invitation ||
      !invitation.expiresAt ||
      invitation.expiresAt.getTime() <= Date.now() ||
      invitation.stageId !== app.currentStageId
    )
      throw new Error(
        "This invitation expired or its application stage changed. Update it before sharing.",
      );
    let outboxId: string | null = null;
    if (input.delivery === "email") {
      const dedupeKey = `manual-booking:${invitation.id}:${input.requestId}`;
      const [queued] = await tx
        .insert(emailOutbox)
        .values({
          workspaceId,
          actorId,
          kind: "interview.booking_invitation",
          dedupeKey,
          payload: {
            invitationId: invitation.id,
            revision: invitation.revision,
            applicationId: app.id,
            subject: input.subject,
            body: input.body,
          },
        })
        .onConflictDoNothing({
          target: [emailOutbox.workspaceId, emailOutbox.dedupeKey],
        })
        .returning({ id: emailOutbox.id });
      const [prior] = queued
        ? []
        : await tx
            .select({ id: emailOutbox.id })
            .from(emailOutbox)
            .where(
              and(
                eq(emailOutbox.workspaceId, workspaceId),
                eq(emailOutbox.dedupeKey, dedupeKey),
              ),
            );
      outboxId = queued?.id ?? prior?.id ?? null;
    }
    return { invitation, outboxId };
  });
}

export async function prepareManualBookingMessage(
  workspaceId: string,
  actorId: string,
  raw: unknown,
) {
  const parsed = z
    .object({
      invitationId: z.string().uuid(),
      revision: z.number(),
      applicationId: databaseUuidSchema,
      subject: z.string(),
      body: z.string(),
    })
    .safeParse(raw);
  if (!parsed.success) return null;
  const payload = parsed.data;
  const invitation = await findBookingInvitation(
    workspaceId,
    payload.applicationId,
  );
  if (
    !invitation ||
    invitation.id !== payload.invitationId ||
    invitation.revision !== payload.revision ||
    invitation.bookingState !== "open" ||
    !invitation.expiresAt ||
    invitation.expiresAt.getTime() <= Date.now() ||
    !(await bookingInvitationAllowed(invitation)) ||
    !(await manualBookingActorAllowed(
      workspaceId,
      actorId,
      payload.applicationId,
    ))
  )
    return null;
  const target = await loadActiveAutomationApplication(
    workspaceId,
    payload.applicationId,
  );
  if (
    !target ||
    target.application.currentStageId !== invitation.stageId ||
    (await applicationHasInterview(workspaceId, payload.applicationId))
  )
    return null;
  const hosts = await loadInvitationHosts(workspaceId, invitation.eventIds);
  if (
    !hosts.some(
      (host) =>
        host.event.webhookId &&
        host.connection.apiKeyCiphertext &&
        host.event.durationMins === invitation.durationMins,
    )
  )
    return null;
  const message = renderMessage(payload.subject, payload.body, target);
  return {
    ...message,
    applicationId: payload.applicationId,
    candidateId: target.candidate.id,
    to: target.candidate.email,
    bodyHtml: `${workflowTextHtml(message.text)}<br /><br /><a href="${workflowTextHtml(invitationLink(invitation))}">Choose an interview time</a>`,
  };
}
