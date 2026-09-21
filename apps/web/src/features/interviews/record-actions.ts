"use server";
import { definitionSchema, freezeCriteria, responsesSchema, ScorecardValidationError } from "@/features/candidates/scorecard-definition";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  activityEvents,
  applications,
  candidates,
  db,
  interviews,
  jobs,
  jobStages,
  scorecards,
} from "@harly/db";
import { requireApplicationPermission } from "@/features/workspaces/permissions-server";
import { findWorkspaceMember } from "./core";
import { parseScheduledAt } from "./shared";

const recordSchema = z
  .object({
    scorecard: z.object({ definitionToken: z.string().max(100000), responses: responsesSchema }).optional(),
    id: z.uuid(),
    applicationId: z.uuid(),
    candidateId: z.uuid(),
    type: z.enum(["screening", "technical", "culture_fit", "onsite", "final"]),
    mode: z.enum(["phone", "video", "onsite"]),
    scheduledAt: z.string().min(1),
    timeZone: z.string().min(1).max(100),
    durationMins: z.number().int().min(1).max(1440),
    interviewerId: z.string().min(1),
    internalNotes: z.string().trim().max(20000),
    rating: z.enum(["strong", "mixed", "weak"]).nullable(),
    assessment: z.string().trim().max(5000),
  })
  .refine((value) => value.rating || !value.assessment, {
    message: "Choose a rating for the assessment.",
    path: ["rating"],
  });

export async function recordInterview(input: unknown) {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid interview.",
    };
  try {
    const data = parsed.data;
    const context = await requireApplicationPermission(
      "interviews:manage",
      data.applicationId,
    );
    if (data.rating)
      await requireApplicationPermission("collab:write", data.applicationId);
    const workspaceId = context.organization.id;
    const when = parseScheduledAt(data.scheduledAt, data.timeZone);
    if (!Number.isFinite(when.getTime()) || when.getTime() > Date.now())
      return {
        success: false as const,
        error: "Choose when the interview happened, not a future time.",
      };
    if (!(await findWorkspaceMember(workspaceId, data.interviewerId)))
      return {
        success: false as const,
        error: "Choose an interviewer in this workspace.",
      };

    await db.transaction(async (tx) => {
      const [application] = await tx
        .select({
          id: applications.id,
          jobId: applications.jobId,
          stageId: applications.currentStageId,
          stageName: jobStages.name,
        })
        .from(applications)
        .innerJoin(
          candidates,
          and(
            eq(candidates.id, applications.candidateId),
            eq(candidates.workspaceId, workspaceId),
            isNull(candidates.deletedAt),
            isNull(candidates.anonymizedAt),
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
        .innerJoin(jobStages, eq(jobStages.id, applications.currentStageId))
        .where(
          and(
            eq(applications.id, data.applicationId),
            eq(applications.workspaceId, workspaceId),
            eq(applications.candidateId, data.candidateId),
          ),
        )
        .limit(1);
      if (!application) throw new Error("Application unavailable");
      const [saved] = await tx
        .insert(interviews)
        .values({
          id: data.id,
          workspaceId,
          applicationId: application.id,
          candidateId: data.candidateId,
          jobId: application.jobId,
          type: data.type,
          mode: data.mode,
          status: "completed",
          source: "recorded",
          scheduledAt: when,
          durationMins: data.durationMins,
          interviewerId: data.interviewerId,
          internalNotes: data.internalNotes || null,
        })
        .onConflictDoNothing({ target: interviews.id })
        .returning({ id: interviews.id });
      if (!saved) {
        const [existing] = await tx
          .select({ id: interviews.id })
          .from(interviews)
          .where(
            and(
              eq(interviews.id, data.id),
              eq(interviews.workspaceId, workspaceId),
              eq(interviews.applicationId, application.id),
              eq(interviews.candidateId, data.candidateId),
              eq(interviews.source, "recorded"),
            ),
          );
        if (!existing) throw new Error("Record conflict");
        return;
      }
      if (data.rating) {
        const [job] = await tx.select({ definition: jobs.scorecardDefinition }).from(jobs).where(and(eq(jobs.id, application.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt))).for("share");
        if (!job) throw new Error("Job unavailable.");
        const criteria = freezeCriteria(definitionSchema.parse(job.definition), data.scorecard);
        await tx
          .insert(scorecards)
          .values({
            criteria,
            workspaceId,
            candidateId: data.candidateId,
            applicationId: application.id,
            interviewId: saved.id,
            stageId: application.stageId,
            stageName: application.stageName,
            authorId: context.user.id,
            rating: data.rating,
            comment: data.assessment || null,
          });
      }
      await tx
        .insert(activityEvents)
        .values({
          workspaceId,
          actorId: context.user.id,
          entityType: "candidate",
          entityId: data.candidateId,
          type: "interview.recorded",
          metadata: {
            interviewId: saved.id,
            applicationId: application.id,
            type: data.type,
            mode: data.mode,
            scheduledAt: when.toISOString(),
          },
        });
    });
    revalidatePath(`/dashboard/candidates/${data.candidateId}`);
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/calendars");
    revalidatePath("/dashboard");
    return { success: true as const, interviewId: data.id };
  } catch (error) {
    if (error instanceof ScorecardValidationError) return { success: false as const, error: error.message };
    return {
      success: false as const,
      error: "Could not record the interview. Check your access and try again.",
    };
  }
}
