import "server-only";
import {
  and,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import {
  automationBookingInvitations,
  db,
  emailOutbox,
  workflowDefinitions,
  workflowRuns,
} from "@harly/db";
import { dispatchWorkflowEvent } from "./dispatch";
import {
  applicationHasInterview,
  loadActiveAutomationApplication,
} from "./candidate-messages";
import { AUTOMATIONS_ENABLED } from "./status";
import { triggerSchema } from "./schema";

/** Timers use the same dispatcher, conditions, actions and history as domain events. */
export async function dispatchWorkflowTimers(now = new Date()) {
  if (!AUTOMATIONS_ENABLED) return { dispatched: 0 };
  const definitions = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.enabled, true),
        eq(workflowDefinitions.status, "published"),
        isNull(workflowDefinitions.deletedAt),
      ),
    );
  let dispatched = 0;
  for (const definition of definitions) {
    const parsed = triggerSchema.safeParse(definition.trigger);
    if (
      !parsed.success ||
      parsed.data.runtimeVersion !== 2 ||
      !definition.publishedAt
    )
      continue;
    const trigger = parsed.data;
    // Interview reminders now use the workspace setting and their own outbox kind.
    if (trigger.event !== "booking.followup_due") continue;
    const hours = trigger.offsetHours;
    if (!hours) continue;
    const offset = hours * 3600000;
    // Recover a short scheduler outage, without bulk-sending old reminders.
    const lower = new Date(
      Math.max(now.getTime() - 3600000, definition.publishedAt.getTime()),
    );
    const key = sql<string>`concat('booking:', ${automationBookingInvitations.id}, ':', ${String(hours)}::text)`;
    const rows = await db
      .select({ invitation: automationBookingInvitations })
      .from(automationBookingInvitations)
      .innerJoin(
        emailOutbox,
        and(
          eq(emailOutbox.id, automationBookingInvitations.outboxId),
          eq(emailOutbox.status, "sent"),
        ),
      )
      .where(
        and(
          eq(automationBookingInvitations.workspaceId, definition.workspaceId),
          eq(automationBookingInvitations.bookingState, "open"),
          isNotNull(emailOutbox.sentAt),
          gte(emailOutbox.sentAt, new Date(lower.getTime() - offset)),
          lte(emailOutbox.sentAt, new Date(now.getTime() - offset)),
          notExists(
            db
              .select({ id: workflowRuns.id })
              .from(workflowRuns)
              .where(
                and(
                  eq(workflowRuns.workflowId, definition.id),
                  eq(workflowRuns.sourceEventId, key),
                ),
              ),
          ),
        ),
      )
      .orderBy(emailOutbox.sentAt)
      .limit(200);
    for (const { invitation } of rows) {
      const target = await loadActiveAutomationApplication(
        definition.workspaceId,
        invitation.applicationId,
      );
      if (
        !target ||
        target.application.currentStageId !== invitation.stageId ||
        (await applicationHasInterview(
          definition.workspaceId,
          invitation.applicationId,
        ))
      )
        continue;
      await dispatchWorkflowEvent(
        definition.workspaceId,
        trigger.event,
        {
          application: { id: target.application.id, jobId: target.job.id },
          candidateId: target.candidate.id,
          jobId: target.job.id,
          invitationId: invitation.id,
        },
        {
          workflowId: definition.id,
          sourceEventId: `booking:${invitation.id}:${hours}`,
        },
      );
      dispatched++;
    }
  }
  return { dispatched };
}
