import type { Route } from "next";

export function taskContextHref(task: {
  candidateId: string | null;
  applicationId: string | null;
}): Route {
  if (!task.candidateId) return "/dashboard/tasks";
  if (!task.applicationId)
    return `/dashboard/candidates/${task.candidateId}` as Route;
  const params = new URLSearchParams({ tab: "profile" });
  if (task.applicationId) params.set("applicationId", task.applicationId);
  return `/dashboard/candidates/${task.candidateId}?${params}#application-tasks` as Route;
}
