type OrderedStage = { id: string; jobId?: string; order: number };

/**
 * The intake stage of every job: lowest `order`, ties broken by id. Mirrors the
 * SQL in `teamApplicationWhere`, so Home's "New applications" count and the
 * list it links to agree even when a job's first stage is not called "Applied".
 */
export function firstStageIds(stages: OrderedStage[]): Set<string> {
  const firstByJob = new Map<string, OrderedStage>();

  for (const stage of stages) {
    const jobKey = stage.jobId ?? "";
    const current = firstByJob.get(jobKey);
    if (
      !current ||
      stage.order < current.order ||
      (stage.order === current.order && stage.id < current.id)
    ) {
      firstByJob.set(jobKey, stage);
    }
  }

  return new Set(Array.from(firstByJob.values(), (stage) => stage.id));
}
