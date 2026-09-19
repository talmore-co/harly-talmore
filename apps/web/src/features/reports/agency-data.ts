import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  applications,
  applicationStageHistory,
  candidates,
  clientOffers,
  clients,
  db,
  jobHiringTeam,
  jobs,
  jobStages,
  offers,
} from "@harly/db";
import {
  getRolePolicy,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import {
  buildAgencyReport,
  reportFilters,
  savedQualification,
  type ReportParams,
} from "./agency-metrics";

/** Reports use the same job assignment, department and region restrictions as
 * job detail pages. Filter options must not disclose inaccessible jobs. */
export async function getAgencyReports(params: ReportParams = {}) {
  const context = await requirePermission("reports:read");
  const ws = context.organization.id;
  const policy = await getRolePolicy(ws, context.roleKey);
  const now = new Date(),
    filters = reportFilters(params, now);
  const [allJobs, assignments] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        clientId: jobs.clientId,
        clientName: clients.name,
        takenOn: jobs.takenOn,
        department: jobs.department,
        region: jobs.jobLocationRegion,
      })
      .from(jobs)
      .leftJoin(
        clients,
        and(eq(clients.id, jobs.clientId), eq(clients.workspaceId, ws)),
      )
      .where(and(eq(jobs.workspaceId, ws), isNull(jobs.deletedAt))),
    policy.scope.jobAccess === "all"
      ? Promise.resolve([])
      : db
          .select({ jobId: jobHiringTeam.jobId })
          .from(jobHiringTeam)
          .where(
            and(
              eq(jobHiringTeam.workspaceId, ws),
              eq(jobHiringTeam.userId, context.user.id),
            ),
          ),
  ]);
  const matches = (allowed: string[], value: string | null) =>
    !allowed.length ||
    (!!value &&
      allowed.some((entry) => entry.toLowerCase() === value.toLowerCase()));
  const assigned = new Set(assignments.map((row) => row.jobId));
  const accessible = allJobs
    .filter(
      (job) =>
        (policy.scope.jobAccess === "all" || assigned.has(job.id)) &&
        matches(policy.scope.departments, job.department) &&
        matches(policy.scope.regions, job.region),
    )
    .map(({ id, title, status, clientId, clientName, takenOn }) => ({
      id,
      title,
      status,
      clientId,
      clientName,
      takenOn,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const selected = accessible.filter(
    (job) =>
      (filters.client === "all" ||
        (filters.client === "none"
          ? !job.clientId
          : job.clientId === filters.client)) &&
      (filters.job === "all" || job.id === filters.job),
  );
  const options = {
    jobs: accessible,
    clients: [
      ...new Map(
        accessible
          .filter((job) => job.clientId)
          .map((job) => [
            job.clientId!,
            { id: job.clientId!, name: job.clientName ?? "Unknown client" },
          ]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name)),
  };
  if (!selected.length)
    return {
      ...buildAgencyReport({
        workspaceId: ws,
        filters,
        jobs: [],
        applications: [],
        transitions: [],
        offers: [],
        now,
      }),
      options,
    };
  const jobIds = selected.map((job) => job.id);
  const visibleApplication = and(
    eq(applications.workspaceId, ws),
    inArray(applications.jobId, jobIds),
    isNull(candidates.deletedAt),
  );
  const readOffers = async (
    table: typeof clientOffers | typeof offers,
    kind: "client" | "talmore",
  ) => {
    const rows = await db
      .select({
        applicationId: table.applicationId,
        status: table.status,
        decidedAt: table.decidedAt,
        offeredAt:
          kind === "client" ? clientOffers.offeredOn : offers.createdAt,
      })
      .from(table)
      .innerJoin(
        applications,
        and(
          eq(applications.id, table.applicationId),
          eq(applications.workspaceId, ws),
        ),
      )
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, ws),
        ),
      )
      .where(and(eq(table.workspaceId, ws), visibleApplication));
    return rows.map((row) => ({
      ...row,
      kind,
      offeredAt:
        row.offeredAt instanceof Date
          ? row.offeredAt.toISOString()
          : row.offeredAt,
      decidedAt: row.decidedAt?.toISOString() ?? null,
    }));
  };
  const [rows, history, clientOfferRows, talmoreOfferRows] = await Promise.all([
    db
      .select({
        id: applications.id,
        candidateId: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        jobId: applications.jobId,
        appliedAt: applications.appliedAt,
        status: applications.status,
        stageId: applications.currentStageId,
        stage: jobStages.name,
        hiredOn: applications.hiredOn,
        rejectionSource: applications.rejectionSource,
        source: applications.source,
        snapshot: sql<unknown>`jsonb_build_object(
          'version', ${applications.questionnaireScoreSnapshot}->'version',
          'threshold', ${applications.questionnaireScoreSnapshot}->'threshold',
          'qualified', ${applications.questionnaireScoreSnapshot}->'qualified'
        )`,
        attribution: applications.attribution,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, ws),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.id, applications.currentStageId),
          eq(jobStages.workspaceId, ws),
        ),
      )
      .where(visibleApplication),
    db
      .select({
        id: applicationStageHistory.id,
        applicationId: applicationStageHistory.applicationId,
        stageId: applicationStageHistory.toStageId,
        stage: jobStages.name,
        at: applicationStageHistory.createdAt,
      })
      .from(applicationStageHistory)
      .innerJoin(
        applications,
        and(
          eq(applications.id, applicationStageHistory.applicationId),
          eq(applications.workspaceId, ws),
        ),
      )
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, ws),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.id, applicationStageHistory.toStageId),
          eq(jobStages.workspaceId, ws),
        ),
      )
      .where(
        and(eq(applicationStageHistory.workspaceId, ws), visibleApplication),
      ),
    readOffers(clientOffers, "client"),
    readOffers(offers, "talmore"),
  ]);
  return {
    ...buildAgencyReport({
      workspaceId: ws,
      filters,
      jobs: selected,
      applications: rows.map(
        ({ firstName, lastName, snapshot, appliedAt, ...row }) => ({
          ...row,
          name: `${firstName} ${lastName}`.trim(),
          appliedAt: appliedAt.toISOString(),
          qualification: savedQualification(snapshot),
        }),
      ),
      transitions: history.map((row) => ({ ...row, at: row.at.toISOString() })),
      offers: [...clientOfferRows, ...talmoreOfferRows],
      now,
    }),
    options,
  };
}
export type AgencyReportsData = Awaited<ReturnType<typeof getAgencyReports>>;
