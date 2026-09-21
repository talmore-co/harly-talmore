import "server-only";
import { and, eq } from "drizzle-orm";
import { db, member } from "@harly/db";
import { getRolePolicy, requirePermission } from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";

export async function automationActorAllowed(workspaceId: string, userId: string, permission: Permission = "automations:manage") {
  const [membership] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId), eq(member.status, "active")));
  if (!membership) return false;
  const policy = await getRolePolicy(workspaceId, membership.role);
  return policy.permissions.includes("automations:manage") && policy.permissions.includes(permission) && policy.scope.jobAccess === "all" && !policy.scope.departments.length && !policy.scope.regions.length;
}

export async function requireAutomationAccess() {
  const context = await requirePermission("automations:manage");
  if (!await automationActorAllowed(context.organization.id, context.user.id)) throw new Error("Managing workspace automations requires unrestricted workspace access.");
  return context;
}
