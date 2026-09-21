import type { Job } from "@harly/db";

export type PublicJob = Omit<Job, "experienceLevel" | "education" | "evaluationMode" | "clientId" | "takenOn" | "scorecardDefinition">;

/** Strip internal evaluation guidance before sending jobs to public clients. */
export function withoutEvaluationGuidance<T extends {
  experienceLevel?: unknown;
  education?: unknown;
  evaluationMode?: unknown;
  clientId?: unknown;
  takenOn?: unknown;
  scorecardDefinition?: unknown;
}>(job: T): Omit<T, "experienceLevel" | "education" | "evaluationMode" | "clientId" | "takenOn" | "scorecardDefinition"> {
  const { experienceLevel, education, evaluationMode, clientId, takenOn, scorecardDefinition, ...publicJob } = job;
  void scorecardDefinition;
  void takenOn;
  void clientId;
  void experienceLevel;
  void education;
  void evaluationMode;
  return publicJob;
}
