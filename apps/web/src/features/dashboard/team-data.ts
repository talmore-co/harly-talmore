import "server-only";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { applications, candidates, db, jobs, mailThreads } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { threadNeedsReply } from "@/features/mailbox/thread-query";

/** Shared by totals and the destination queue; never count a limited preview. */
export function teamApplicationWhere(workspaceId: string, screening: boolean) {
  return and(
    eq(applications.workspaceId, workspaceId), eq(applications.status, "active"),
    eq(jobs.workspaceId, workspaceId), eq(jobs.status, "open"), isNull(jobs.deletedAt),
    eq(candidates.workspaceId, workspaceId), isNull(candidates.deletedAt),
    screening ? sql`${applications.currentStageId} = (
      select initial.id from job_stages initial
      where initial.workspace_id = ${workspaceId} and initial.job_id = ${applications.jobId}
        and initial.name = 'Applied' and initial.id = ${applications.currentStageId}
    )` : undefined,
  );
}

export async function getTeamDashboardCounts() {
  const { organization } = await getWorkspaceContext();
  const countApplications = async (screening: boolean) => {
    const [row] = await db.select({ value: count() }).from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId)).innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .where(teamApplicationWhere(organization.id, screening));
    return row.value;
  };
  const [screening, active, replies] = await Promise.all([
    countApplications(true), countApplications(false),
    db.select({ value: count() }).from(mailThreads)
      .leftJoin(candidates, and(eq(candidates.id, mailThreads.candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)))
      .where(and(eq(mailThreads.workspaceId, organization.id), eq(mailThreads.status, "open"),
        or(isNull(mailThreads.candidateId), sql`${candidates.id} is not null`),
        threadNeedsReply())),
  ]);
  return { screening, active, replies: replies[0].value };
}
