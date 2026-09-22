import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { applications, automationBookingInvitations, candidates, db, interviews, jobs, member, personalCalConnections, personalCalEvents, workflowDefinitions } from "@harly/db";
import { buildCalBookingLink } from "@/lib/cal/link";
import { signCalBookingReference } from "@/lib/cal/booking-reference";
import { signBookingInvitation } from "@/lib/cal/invitation-token";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { loadInvitationHosts } from "@/lib/cal/pool-hosts";
import { automationActorAllowed } from "./access";
import { renderWorkflowText, workflowTextHtml } from "./message-template";

export const candidateMessageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  interviewerId: z.string().optional(),
  interviewerIds: z.array(z.string().min(1)).max(10).optional(),
  timeZone: z.string().default("UTC").refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Choose an IANA time zone."),
});
export type CandidateMessageKind = "send_booking_invitation" | "send_booking_followup" | "send_interview_reminder";
export type CandidateMessagePayload = {
  kind: CandidateMessageKind; workflowId: string; definitionVersion: number; applicationId: string;
  invitationId?: string; interviewId?: string; scheduledAt?: string;
  config: z.infer<typeof candidateMessageSchema>;
};

export async function loadActiveAutomationApplication(workspaceId: string, applicationId: string) {
  const [row] = await db.select({ application: applications, candidate: candidates, job: jobs }).from(applications)
    .innerJoin(candidates, and(eq(candidates.id, applications.candidateId), eq(candidates.workspaceId, workspaceId), isNull(candidates.deletedAt), isNull(candidates.anonymizedAt)))
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt), eq(jobs.status, "open")))
    .where(and(eq(applications.id, applicationId), eq(applications.workspaceId, workspaceId), eq(applications.status, "active")));
  return row ?? null;
}

export async function applicationHasInterview(workspaceId: string, applicationId: string) {
  const [row] = await db.select({ id: interviews.id }).from(interviews).where(and(eq(interviews.workspaceId, workspaceId), eq(interviews.applicationId, applicationId), ne(interviews.status, "canceled"))).limit(1);
  return Boolean(row);
}

export async function connectedBookingEvent(workspaceId: string, interviewerId: string, eventId?: string) {
  const [row] = await db.select({ event: personalCalEvents }).from(personalCalEvents)
    .innerJoin(personalCalConnections, eq(personalCalEvents.connectionId, personalCalConnections.id))
    .innerJoin(member, and(eq(member.organizationId, workspaceId), eq(member.userId, personalCalConnections.userId), eq(member.status, "active")))
    .where(and(eq(personalCalConnections.workspaceId, workspaceId), eq(personalCalConnections.userId, interviewerId), eq(personalCalConnections.enabled, true),
      eventId ? eq(personalCalEvents.id, eventId) : eq(personalCalEvents.eventTypeId, personalCalConnections.defaultEventTypeId)));
  if (!row?.event.webhookId) throw new Error("The interviewer must connect Cal.com and configure booking sync in Account → Connections.");
  return row.event;
}

export async function connectedBookingPool(workspaceId: string, config: { interviewerIds?: string[]; interviewerId?: string }) {
  const ids = [...new Set(config.interviewerIds ?? (config.interviewerId ? [config.interviewerId] : []))];
  if (!ids.length || ids.length > 10) throw new Error("Choose between one and ten recruiters with connected Cal.com accounts.");
  const events = await Promise.all(ids.map((id) => connectedBookingEvent(workspaceId, id)));
  if (events.some((event) => event.durationMins !== events[0]!.durationMins)) throw new Error("All recruiters in this booking pool must use the same interview duration.");
  return events;
}

/** Re-check immediately before email delivery: queued reminders must not outlive their target. */
export async function prepareCandidateWorkflowMessage(workspaceId: string, actorId: string, payload: CandidateMessagePayload) {
  // Retired workflow payloads may still be queued after an upgrade.
  if (["send_interview_reminder"].includes(payload.kind)) return null;
  if (!await automationActorAllowed(workspaceId, actorId, "collab:write")) return null;
  const [workflow] = await db.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.id, payload.workflowId), eq(workflowDefinitions.workspaceId, workspaceId), isNull(workflowDefinitions.deletedAt)));
  if (!workflow?.enabled || workflow.status !== "published" || workflow.definitionVersion !== payload.definitionVersion) return null;
  const target = await loadActiveAutomationApplication(workspaceId, payload.applicationId);
  if (!target?.candidate.email) return null;
  const config = candidateMessageSchema.parse(payload.config);
  let link = "";
  let interviewContext: Record<string, string> = {};
  if (payload.kind === "send_interview_reminder") {
    if (!payload.interviewId) return null;
    const [interview] = await db.select().from(interviews).where(and(eq(interviews.id, payload.interviewId), eq(interviews.workspaceId, workspaceId), eq(interviews.applicationId, payload.applicationId)));
    if (!interview || interview.status !== "scheduled" || interview.scheduledAt.toISOString() !== payload.scheduledAt || interview.scheduledAt.getTime() <= Date.now()) return null;
    const when = new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short", timeZone: config.timeZone }).format(interview.scheduledAt);
    interviewContext = { when: `${when} (${config.timeZone})`, location: interview.meetLink || interview.location || "See your interview invitation" };
  } else {
    if (!payload.invitationId || await applicationHasInterview(workspaceId, payload.applicationId)) return null;
    const [invitation] = await db.select().from(automationBookingInvitations).where(and(eq(automationBookingInvitations.id, payload.invitationId), eq(automationBookingInvitations.workspaceId, workspaceId), eq(automationBookingInvitations.applicationId, payload.applicationId)));
    if (!invitation || invitation.bookingState !== "open" || invitation.stageId !== target.application.currentStageId || invitation.createdAt.getTime() < Date.now() - 30 * 86400000) return null;
    if (invitation.tokenSecret) {
      if (!invitation.expiresAt || invitation.expiresAt.getTime() <= Date.now()) return null;
      const hosts = await loadInvitationHosts(workspaceId, invitation.eventIds);
      if (!hosts.some((host) => host.event.webhookId && host.connection.apiKeyCiphertext && host.event.durationMins === invitation.durationMins)) return null;
      if (!invitation.workflowId) return null;
      const [source] = await db.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.id, invitation.workflowId), eq(workflowDefinitions.workspaceId, workspaceId), isNull(workflowDefinitions.deletedAt)));
      if (!source?.enabled || source.status !== "published" || source.definitionVersion !== invitation.definitionVersion || !source.createdById || !await automationActorAllowed(workspaceId, source.createdById, "collab:write")) return null;
      link = `${getHarlyPublicOrigin()}/book/interview#${signBookingInvitation(invitation.id, invitation.tokenSecret)}`;
    } else {
      if (!invitation.eventId) return null;
      const event = await connectedBookingEvent(workspaceId, config.interviewerId ?? "", invitation.eventId);
      link = buildCalBookingLink({ bookingUrl: event.bookingUrl, name: `${target.candidate.firstName} ${target.candidate.lastName}`, email: target.candidate.email, metadata: { harlyBookingRef: signCalBookingReference(payload.applicationId, event.id, event.webhookSecret) } });
    }
  }
  const context = { candidate: { firstName: target.candidate.firstName, lastName: target.candidate.lastName }, job: { title: target.job.title }, interview: interviewContext };
  const subject = renderWorkflowText(config.subject, context);
  const text = renderWorkflowText(config.body, context);
  // Booking links are appended server-side, never written into workflow logs or definitions.
  const bodyHtml = `${workflowTextHtml(text)}${link ? `<br /><br /><a href="${workflowTextHtml(link)}">Choose your interview time</a>` : ""}`;
  return { to: target.candidate.email, candidateId: target.candidate.id, subject, text, bodyHtml };
}
