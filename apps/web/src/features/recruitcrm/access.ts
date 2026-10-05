import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { applications, db, jobHiringTeam, jobs, jobStages, member } from "@harly/db";
import { getRolePolicy } from "@/features/workspaces/permissions-server";
import { CrmError } from "./client";

export async function importAccess(workspaceId: string, actorId: string, jobId: string | null, stageId: string | null, candidateId?: string) {
  const [membership] = await db.select().from(member).where(and(eq(member.organizationId, workspaceId), eq(member.userId, actorId), eq(member.status, "active")));
  if (!membership) throw new CrmError("The import's recruiter is no longer an active workspace member.");
  const policy = await getRolePolicy(workspaceId, membership.role);
  if (!policy.permissions.includes("candidates:edit")) throw new CrmError("Candidate import permission is required.");
  const unrestricted = policy.scope.jobAccess === "all" && !policy.scope.departments.length && !policy.scope.regions.length;
  const matches = (allowed: string[], value: string | null) => !allowed.length || Boolean(value && allowed.some(item => item.toLowerCase() === value.toLowerCase()));
  async function allowedJob(id: string) {
    const [job] = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)));
    if (!job || !matches(policy.scope.departments, job.department) || !matches(policy.scope.regions, job.jobLocationRegion)) return null;
    if (policy.scope.jobAccess === "assigned") {
      const [assigned] = await db.select().from(jobHiringTeam).where(and(eq(jobHiringTeam.jobId, id), eq(jobHiringTeam.workspaceId, workspaceId), eq(jobHiringTeam.userId, actorId)));
      if (!assigned) return null;
    }
    return job;
  }
  if (!jobId) { if (!unrestricted) throw new CrmError("Importing directly to the Talent pool requires unrestricted candidate access."); }
  else {
    const job = await allowedJob(jobId);
    const [stage] = stageId ? await db.select().from(jobStages).where(and(eq(jobStages.id, stageId), eq(jobStages.jobId, jobId), eq(jobStages.workspaceId, workspaceId))) : [];
    if (job?.status !== "open" || !stage || ["hired", "rejected", "rejected by client"].includes(stage.name.trim().toLowerCase())) throw new CrmError("Choose an accessible open job and active pipeline stage.");
  }
  if (candidateId && !unrestricted) {
    const rows = await db.select({ jobId: applications.jobId }).from(applications).where(and(eq(applications.workspaceId, workspaceId), eq(applications.candidateId, candidateId)));
    for (const row of rows) if (await allowedJob(row.jobId)) return;
    throw new CrmError("An existing candidate match is outside your access. Ask an administrator to import it.");
  }
}
