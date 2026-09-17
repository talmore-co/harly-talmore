import type { Job } from "@harly/db";

export type PublicJob = Omit<Job, "experienceLevel" | "education" | "evaluationMode">;

/** Strip internal evaluation guidance before sending jobs to public clients. */
export function withoutEvaluationGuidance<T extends {
  experienceLevel?: unknown;
  education?: unknown;
  evaluationMode?: unknown;
}>(job: T): Omit<T, "experienceLevel" | "education" | "evaluationMode"> {
  const { experienceLevel, education, evaluationMode, ...publicJob } = job;
  void experienceLevel;
  void education;
  void evaluationMode;
  return publicJob;
}
