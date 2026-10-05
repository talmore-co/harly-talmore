import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  clients,
  db,
  jobHiringTeam,
  jobStages,
  jobs,
  member,
  type Job,
} from "@harly/db";

import { createJob, getDashboardJob } from "./data";
import { buildDuplicateJobValues } from "./duplicate";

/**
 * Create a draft copy of a job in the current workspace. Returns `null` when
 * the source job does not exist (or is in the trash).
 *
 * The copy goes through `createJob`, which owns the defaults: draft status, a
 * unique slug, the creator on the hiring team and the application questions.
 * Applications, approvals and the publish date are never copied.
 */
export async function duplicateJob(sourceJobId: string): Promise<Job | null> {
  const source = await getDashboardJob(sourceJobId);
  if (!source) return null;
  const { job, stages, workspace } = source;

  const copy = await createJob(buildDuplicateJobValues(job));

  // Everything the job form does not carry: client, scorecard, the source's
  // own pipeline stages and the rest of its hiring team.
  await db.transaction(async (tx) => {
    const [client] = job.clientId
      ? await tx
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(
              eq(clients.id, job.clientId),
              eq(clients.workspaceId, workspace.id),
              isNull(clients.archivedAt),
            ),
          )
          .limit(1)
      : [];

    await tx
      .update(jobs)
      .set({
        clientId: client?.id ?? null,
        scorecardDefinition: job.scorecardDefinition,
        officeLat: job.officeLat,
        officeLng: job.officeLng,
      })
      .where(and(eq(jobs.id, copy.id), eq(jobs.workspaceId, workspace.id)));

    // The copy has no applications yet, so its default stages can be swapped
    // for the source's (possibly customised) pipeline.
    if (stages.length > 0) {
      await tx
        .delete(jobStages)
        .where(
          and(
            eq(jobStages.jobId, copy.id),
            eq(jobStages.workspaceId, workspace.id),
          ),
        );
      await tx.insert(jobStages).values(
        stages.map((stage) => ({
          workspaceId: workspace.id,
          jobId: copy.id,
          name: stage.name,
          color: stage.color,
          order: stage.order,
          emailConfig: stage.emailConfig,
        })),
      );
    }

    const team = await tx
      .select({ userId: jobHiringTeam.userId, role: jobHiringTeam.role })
      .from(jobHiringTeam)
      .innerJoin(
        member,
        and(
          eq(member.organizationId, workspace.id),
          eq(member.userId, jobHiringTeam.userId),
          eq(member.status, "active"),
        ),
      )
      .where(
        and(
          eq(jobHiringTeam.workspaceId, workspace.id),
          eq(jobHiringTeam.jobId, job.id),
        ),
      );
    if (team.length > 0) {
      // The creator is already on the copy's team; keep that row.
      await tx
        .insert(jobHiringTeam)
        .values(
          team.map((entry) => ({
            workspaceId: workspace.id,
            jobId: copy.id,
            userId: entry.userId,
            role: entry.role,
          })),
        )
        .onConflictDoNothing({
          target: [jobHiringTeam.jobId, jobHiringTeam.userId],
        });
    }
  });

  return copy;
}
