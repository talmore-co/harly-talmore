import "server-only";

import { and, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import {
  applications,
  applicationStageHistory,
  candidates,
  clients,
  db,
  jobHiringTeam,
  jobs,
  jobStages,
} from "@harly/db";
import {
  getRolePolicy,
  requirePermission,
} from "@/features/workspaces/permissions-server";

export async function listPlacements() {
  const context = await requirePermission("candidates:view");
  const workspaceId = context.organization.id;
  const policy = await getRolePolicy(workspaceId, context.roleKey);
  const firstHire = db
    .select({
      applicationId: applicationStageHistory.applicationId,
      hiredOn:
        sql<string>`to_char(min(${applicationStageHistory.createdAt}) at time zone 'UTC', 'YYYY-MM-DD')`.as(
          "first_hired_on",
        ),
    })
    .from(applicationStageHistory)
    .innerJoin(
      jobStages,
      and(
        eq(jobStages.id, applicationStageHistory.toStageId),
        eq(jobStages.workspaceId, workspaceId),
        sql`lower(trim(${jobStages.name})) = 'hired'`,
      ),
    )
    .where(eq(applicationStageHistory.workspaceId, workspaceId))
    .groupBy(applicationStageHistory.applicationId)
    .as("first_hire");
  const hiredOn = sql<
    string | null
  >`coalesce(${applications.hiredOn}, ${firstHire.hiredOn})`;
  return db
    .select({
      id: applications.id,
      candidateId: candidates.id,
      candidateName: sql<string>`concat_ws(' ', ${candidates.firstName}, ${candidates.lastName})`,
      jobId: jobs.id,
      jobTitle: jobs.title,
      clientId: jobs.clientId,
      clientName: clients.name,
      hiredOn,
      terms: applications.hireTerms,
      status: applications.status,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, jobs.clientId), eq(clients.workspaceId, workspaceId)),
    )
    .leftJoin(firstHire, eq(firstHire.applicationId, applications.id))
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        sql`(${hiredOn} is not null or ${applications.status} = 'hired')`,
        policy.scope.departments.length
          ? inArray(
              sql`lower(${jobs.department})`,
              policy.scope.departments.map((value) => value.toLowerCase()),
            )
          : undefined,
        policy.scope.regions.length
          ? inArray(
              sql`lower(${jobs.jobLocationRegion})`,
              policy.scope.regions.map((value) => value.toLowerCase()),
            )
          : undefined,
        policy.scope.jobAccess === "assigned"
          ? exists(
              db
                .select({ id: jobHiringTeam.id })
                .from(jobHiringTeam)
                .where(
                  and(
                    eq(jobHiringTeam.workspaceId, workspaceId),
                    eq(jobHiringTeam.jobId, jobs.id),
                    eq(jobHiringTeam.userId, context.user.id),
                  ),
                ),
            )
          : undefined,
      ),
    )
    .orderBy(
      sql`${hiredOn} desc nulls last`,
      desc(applications.createdAt),
      applications.id,
    );
}

export type PlacementRow = Awaited<ReturnType<typeof listPlacements>>[number];
