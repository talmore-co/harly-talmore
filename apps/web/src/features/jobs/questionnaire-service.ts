import "server-only";
import { ApiError } from "@harly/api";
import { and, eq, isNull } from "drizzle-orm";
import { db, jobs } from "@harly/db";
import {
  applicationConfigSchema,
  normalizeJobApplicationConfig,
  questionSchema,
} from "./config";
import { syncJobApplicationQuestions } from "./data";
import { z } from "zod";

export const questionnaireSchema = z
  .object({
    questions: z.array(questionSchema).max(10),
    qualifiedScoreThreshold: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (input) =>
      new Set(input.questions.map((question) => question.id)).size ===
      input.questions.length,
    "Question IDs must be unique.",
  );

export async function saveJobQuestionnaire(input: {
  workspaceId: string;
  jobId: string;
  expectedUpdatedAt: string;
  questionnaire: unknown;
}) {
  const questionnaire = questionnaireSchema.parse(input.questionnaire);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.workspaceId, input.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .for("update");
    if (!job || job.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw ApiError.conflict(
        "Job changed. Read its questionnaire again before saving.",
      );
    const config = applicationConfigSchema.parse({
      ...normalizeJobApplicationConfig(job.applicationConfig),
      ...questionnaire,
      qualifiedScoreThreshold: questionnaire.qualifiedScoreThreshold,
    });
    await syncJobApplicationQuestions(tx, {
      workspaceId: input.workspaceId,
      jobId: job.id,
      values: config.questions,
    });
    const [updated] = await tx
      .update(jobs)
      .set({ applicationConfig: config, updatedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .returning({ updatedAt: jobs.updatedAt });
    return {
      jobId: job.id,
      updatedAt: updated!.updatedAt.toISOString(),
      ...questionnaire,
    };
  });
}
