import type { Job } from "@harly/db";

export type PublicJob = Omit<Job, "experienceLevel" | "education" | "evaluationMode" | "clientId" | "takenOn">;

/** Strip internal evaluation guidance before sending jobs to public clients. */
export function withoutEvaluationGuidance<T extends {
  experienceLevel?: unknown;
  education?: unknown;
  evaluationMode?: unknown;
  clientId?: unknown;
  takenOn?: unknown;
}>(job: T): Omit<T, "experienceLevel" | "education" | "evaluationMode" | "clientId" | "takenOn"> {
  const { experienceLevel, education, evaluationMode, clientId, takenOn, ...publicJob } = job;
  void takenOn;
  void clientId;
  void experienceLevel;
  void education;
  void evaluationMode;
  return publicJob;
}
