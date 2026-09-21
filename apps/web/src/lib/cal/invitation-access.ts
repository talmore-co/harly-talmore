import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import {
  automationBookingInvitations,
  db,
  member,
  workflowDefinitions,
  jobHiringTeam,
} from "@harly/db";
import { getRolePolicy } from "@/features/workspaces/permissions-server";
import { loadActiveAutomationApplication } from "@/features/automations/candidate-messages";
import { automationActorAllowed } from "@/features/automations/access";
import { AUTOMATIONS_ENABLED } from "@/features/automations/status";

export async function manualBookingActorAllowed(
  workspaceId: string,
  actorId: string,
  applicationId: string,
) {
  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, actorId),
        eq(member.status, "active"),
      ),
    );
  if (!membership) return false;
  const policy = await getRolePolicy(workspaceId, membership.role);
  if (!policy.permissions.includes("collab:write")) return false;
  const target = await loadActiveAutomationApplication(
    workspaceId,
    applicationId,
  );
  if (!target) return false;
  const matches = (allowed: string[], value: string | null) =>
    !allowed.length ||
    Boolean(
      value &&
      allowed.some((item) => item.toLowerCase() === value.toLowerCase()),
    );
  if (
    !matches(policy.scope.departments, target.job.department) ||
    !matches(policy.scope.regions, target.job.jobLocationRegion)
  )
    return false;
  if (policy.scope.jobAccess === "all") return true;
  const [assignment] = await db
    .select({ id: jobHiringTeam.id })
    .from(jobHiringTeam)
    .where(
      and(
        eq(jobHiringTeam.workspaceId, workspaceId),
        eq(jobHiringTeam.jobId, target.job.id),
        eq(jobHiringTeam.userId, actorId),
      ),
    );
  return Boolean(assignment);
}

export async function bookingInvitationAllowed(
  invitation: typeof automationBookingInvitations.$inferSelect,
) {
  if (!invitation.workflowId)
    return Boolean(
      invitation.createdById &&
      (await manualBookingActorAllowed(
        invitation.workspaceId,
        invitation.createdById,
        invitation.applicationId,
      )),
    );
  if (!AUTOMATIONS_ENABLED) return false;
  const [workflow] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, invitation.workflowId),
        eq(workflowDefinitions.workspaceId, invitation.workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    );
  return Boolean(
    workflow?.enabled &&
    workflow.status === "published" &&
    workflow.definitionVersion === invitation.definitionVersion &&
    workflow.createdById &&
    (await automationActorAllowed(
      invitation.workspaceId,
      workflow.createdById,
      "collab:write",
    )),
  );
}
