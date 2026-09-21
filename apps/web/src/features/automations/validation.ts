import "server-only";
import { workflowInputSchema, type WorkflowDefinitionInput } from "./schema";
import { getActionHandler } from "./registry";
import { candidateMessageSchema, connectedBookingPool } from "./candidate-messages";
import { automationActorAllowed } from "./access";
import type { Permission } from "@/features/workspaces/permissions";
import { validateBookingPool } from "@/lib/cal/pool-hosts";
import { getTableColumns } from "drizzle-orm";
import { aiEvaluations, applications, candidates, jobs } from "@harly/db";

const internalTextVariables = new Set([
  "workspaceId", "application.stage",
  ...Object.entries({ candidate: candidates, application: applications, job: jobs, ai: aiEvaluations }).flatMap(([entity, table]) => Object.entries(getTableColumns(table)).filter(([, column]) => column.dataType === "string" || column.dataType === "number").map(([field]) => `${entity}.${field}`)),
]);

export const V1_ACTIONS = ["move_stage", "add_note", "add_tag", "remove_tag", "create_task", "send_booking_invitation", "send_booking_followup"];

export async function validatePublishedWorkflow(workspaceId: string, actorId: string, input: WorkflowDefinitionInput) {
  const parsed = workflowInputSchema.parse(input);
  let bookingPool: { eventIds: string[]; durationMins: number; locationFormat: string } | null = null;
  const trigger = parsed.trigger;
  if (trigger.event === "interview.reminder_due" || parsed.actions.some((action) => action.type === "send_interview_reminder")) throw new Error("Interview reminders are now managed in Settings → Interviews.");
  if (parsed.actions.filter((action) => action.type === "send_booking_invitation").length > 1) throw new Error("Use one booking invitation action per workflow. Select all eligible recruiters in that action.");
  if (["interview.reminder_due", "booking.followup_due"].includes(trigger.event) && !trigger.offsetHours) throw new Error("Choose the reminder timing in hours.");
  for (const action of parsed.actions) {
    if (!V1_ACTIONS.includes(action.type)) throw new Error(`This action is not available in this version: ${action.type}`);
    const handler = getActionHandler(action.type);
    if (!handler) throw new Error("Unsupported workflow action.");
    handler.schema.parse(action.config);
    if (action.type.startsWith("send_")) {
      const allowed = new Set(["candidate.firstName", "candidate.lastName", "job.title", ...(action.type === "send_interview_reminder" ? ["interview.when", "interview.location"] : [])]);
      for (const text of [action.config.subject, action.config.body]) {
        for (const match of String(text ?? "").matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!allowed.has(match[1])) throw new Error(`Unknown message variable: ${match[1]}`);
      }
    }
    if (["add_note", "create_task", "add_tag", "remove_tag"].includes(action.type)) {
      for (const key of ["body", "title", "description", "label"]) {
        const text = action.config[key];
        if (typeof text !== "string") continue;
        for (const match of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!internalTextVariables.has(match[1]!)) throw new Error(`Unknown message variable: ${match[1]}`);
      }
    }
    if (handler.requiresPermission && !await automationActorAllowed(workspaceId, actorId, handler.requiresPermission as Permission)) throw new Error(`The workflow creator needs ${handler.requiresPermission} permission.`);
    if (action.type === "send_booking_invitation") {
      const events = await connectedBookingPool(workspaceId, candidateMessageSchema.parse(action.config));
      const eventIds = events.map((event) => event.id);
      const locationFormat = await validateBookingPool(workspaceId, eventIds);
      bookingPool = { eventIds, durationMins: events[0]!.durationMins, locationFormat };
    }
    if (action.type === "send_booking_followup" && trigger.event !== "booking.followup_due") throw new Error("Use the booking follow-up trigger for a booking follow-up message.");
    if (action.type === "move_stage" && /^(hired|rejected|rejected by client)$/i.test(String(action.config.toStageName ?? ""))) throw new Error("Choose an active pipeline stage for automatic progression.");
  }
  return { definition: parsed, bookingPool };
}
