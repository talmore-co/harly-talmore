import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  applications,
  applicationStageHistory,
  candidates,
  db,
  interviews,
  jobHiringTeam,
  jobStages,
  member,
  scorecards,
  tasks,
  user,
} from "@harly/db";
import type { ReportFilters } from "./agency-metrics";

export type RecruiterReportRow = {
  id: string;
  name: string;
  role: string;
  jobs: number;
  interviews: number;
  assessments: number;
  tasksCompleted: number;
  overdueTasks: number;
  submissions: number;
  placements: number;
  missingAssessments: Array<{
    id: string;
    name: string;
    candidateId: string;
    applicationId: string;
  }>;
};

/** Called only with the report loader's permission-filtered job IDs. */
export async function loadRecruiterReport(
  workspaceId: string,
  jobIds: string[],
  filters: ReportFilters,
  now: Date,
  includeUnassigned = false,
): Promise<RecruiterReportRow[]> {
  if (!jobIds.length) return [];
  const [
    members,
    assignments,
    appRows,
    interviewRows,
    assessmentRows,
    taskRows,
    transitions,
  ] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, workspaceId)),
    db
      .select({ userId: jobHiringTeam.userId, jobId: jobHiringTeam.jobId })
      .from(jobHiringTeam)
      .where(
        and(
          eq(jobHiringTeam.workspaceId, workspaceId),
          inArray(jobHiringTeam.jobId, jobIds),
        ),
      ),
    db
      .select({
        id: applications.id,
        candidateId: candidates.id,
        name: candidates.firstName,
        lastName: candidates.lastName,
        jobId: applications.jobId,
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
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          inArray(applications.jobId, jobIds),
        ),
      ),
    db
      .select({
        id: interviews.id,
        applicationId: interviews.applicationId,
        userId: interviews.interviewerId,
        at: interviews.scheduledAt,
        status: interviews.status,
      })
      .from(interviews)
      .where(
        and(
          eq(interviews.workspaceId, workspaceId),
          inArray(interviews.jobId, jobIds),
        ),
      ),
    db
      .select({
        applicationId: scorecards.applicationId,
        interviewId: scorecards.interviewId,
        userId: scorecards.authorId,
        at: scorecards.createdAt,
      })
      .from(scorecards)
      .innerJoin(
        applications,
        and(
          eq(applications.id, scorecards.applicationId),
          eq(applications.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(scorecards.workspaceId, workspaceId),
          inArray(applications.jobId, jobIds),
        ),
      ),
    db
      .select({
        applicationId: tasks.applicationId,
        userId: tasks.ownerId,
        completedAt: tasks.completedAt,
        dueDate: tasks.dueDate,
        status: tasks.status,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.jobId, jobIds),
          isNull(tasks.deletedAt),
        ),
      ),
    db
      .select({
        id: applicationStageHistory.id,
        applicationId: applicationStageHistory.applicationId,
        userId: applicationStageHistory.movedById,
        at: applicationStageHistory.createdAt,
        stage: jobStages.name,
      })
      .from(applicationStageHistory)
      .innerJoin(
        applications,
        and(
          eq(applications.id, applicationStageHistory.applicationId),
          eq(applications.workspaceId, workspaceId),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.id, applicationStageHistory.toStageId),
          eq(jobStages.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(applicationStageHistory.workspaceId, workspaceId),
          inArray(applications.jobId, jobIds),
        ),
      ),
  ]);
  const visible = new Map(appRows.map((app) => [app.id, app]));
  const inPeriod = (date: Date | null) =>
    !!date &&
    date.toISOString().slice(0, 10) >= filters.from &&
    date.toISOString().slice(0, 10) <= filters.to;
  const first = new Map<string, (typeof transitions)[number]>();
  for (const row of transitions.sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id),
  )) {
    const stage = row.stage.trim().toLowerCase();
    if (
      !visible.has(row.applicationId) ||
      !["submitted", "hired"].includes(stage)
    )
      continue;
    const key = `${row.applicationId}:${stage}`;
    if (!first.has(key)) first.set(key, row);
  }
  return members
    .map((person) => {
      const completed = interviewRows.filter(
        (row) =>
          row.userId === person.id &&
          row.status === "completed" &&
          visible.has(row.applicationId) &&
          inPeriod(row.at),
      );
      const ownTasks = taskRows.filter(
        (row) =>
          row.userId === person.id &&
          (!row.applicationId || visible.has(row.applicationId)),
      );
      const outcomes = [...first.values()].filter(
        (row) => row.userId === person.id && inPeriod(row.at),
      );
      return {
        ...person,
        jobs: new Set(
          assignments
            .filter((row) => row.userId === person.id)
            .map((row) => row.jobId),
        ).size,
        interviews: completed.length,
        assessments: assessmentRows.filter(
          (row) =>
            row.userId === person.id &&
            row.applicationId &&
            visible.has(row.applicationId) &&
            inPeriod(row.at),
        ).length,
        tasksCompleted: ownTasks.filter(
          (row) => row.status === "completed" && inPeriod(row.completedAt),
        ).length,
        overdueTasks: ownTasks.filter(
          (row) =>
            ["pending", "in_progress"].includes(row.status) &&
            row.dueDate &&
            row.dueDate.toISOString().slice(0, 10) <
              now.toISOString().slice(0, 10),
        ).length,
        submissions: outcomes.filter(
          (row) => row.stage.trim().toLowerCase() === "submitted",
        ).length,
        placements: outcomes.filter(
          (row) => row.stage.trim().toLowerCase() === "hired",
        ).length,
        missingAssessments: completed
          .filter(
            (row) =>
              !assessmentRows.some(
                (assessment) =>
                  assessment.interviewId === row.id &&
                  assessment.userId === person.id,
              ),
          )
          .map((row) => {
            const app = visible.get(row.applicationId)!;
            return {
              id: row.id,
              name: `${app.name} ${app.lastName}`,
              candidateId: app.candidateId,
              applicationId: app.id,
            };
          }),
      };
    })
    .filter(
      (row) =>
        includeUnassigned ||
        row.jobs ||
        row.interviews ||
        row.assessments ||
        row.tasksCompleted ||
        row.overdueTasks ||
        row.submissions ||
        row.placements,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
