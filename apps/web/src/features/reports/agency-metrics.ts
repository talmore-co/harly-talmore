import { attributionSchema } from "@/features/applications/attribution";
import { validDashboardDay } from "@/features/dashboard/day";

const DAY = 86_400_000;
export type ReportParams = {
  range?: string;
  from?: string;
  to?: string;
  client?: string;
  job?: string;
  tab?: string;
  aging?: string;
};
export type ReportFilters = {
  range: string;
  from: string;
  to: string;
  client: string;
  job: string;
  tab: "overview" | "clients" | "sources" | "recruiters";
  aging: number;
};
export function reportFilters(
  params: ReportParams,
  now = new Date(),
): ReportFilters {
  const today = now.toISOString().slice(0, 10);
  const range = ["30", "90", "365", "month", "last-month", "custom"].includes(
    params.range ?? "",
  )
    ? params.range!
    : "30";
  let from = today,
    to = today;
  if (range === "month") from = `${today.slice(0, 7)}-01`;
  else if (range === "last-month") {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    to = end.toISOString().slice(0, 10);
    from = `${to.slice(0, 7)}-01`;
  } else if (range === "custom") {
    if (
      !validDashboardDay(params.from) ||
      !validDashboardDay(params.to) ||
      params.from > params.to ||
      params.to > today ||
      Date.parse(params.to) - Date.parse(params.from) > 730 * DAY
    ) {
      throw new Error(
        "Choose valid dates, ending today or earlier, spanning no more than two years.",
      );
    }
    from = params.from;
    to = params.to;
  } else
    from = new Date(Date.parse(today) - (Number(range) - 1) * DAY)
      .toISOString()
      .slice(0, 10);
  for (const value of [params.client, params.job]) {
    if (
      value &&
      !["all", "none"].includes(value) &&
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    )
      throw new Error("Invalid report filter.");
  }
  return {
    range,
    from,
    to,
    client: params.client || "all",
    job: params.job || "all",
    tab:
      params.tab === "clients" || params.tab === "sources" || params.tab === "recruiters"
        ? params.tab
        : "overview",
    aging: [7, 14, 30].includes(Number(params.aging))
      ? Number(params.aging)
      : 7,
  };
}

export type ReportJob = {
  takenOn?: string | null;
  id: string;
  title: string;
  status: string;
  clientId: string | null;
  clientName: string | null;
};
export type ReportApplication = {
  id: string;
  candidateId: string;
  name: string;
  jobId: string;
  appliedAt: string;
  status: string;
  stageId: string;
  stage: string;
  hiredOn: string | null;
  rejectionSource: "agency" | "client" | null;
  source: string | null;
  qualification: boolean | null;
  attribution: unknown;
};
export type ReportTransition = {
  id: string;
  applicationId: string;
  stageId: string;
  stage: string;
  at: string;
};
export type ReportOffer = {
  applicationId: string;
  kind: "client" | "talmore";
  status: string;
  offeredAt: string;
  decidedAt: string | null;
};
export type ReportRecord = {
  applicationId: string;
  candidateId: string;
  name: string;
  jobId: string;
  job: string;
  client: string;
  stage: string;
  appliedOn: string;
  submittedOn: string | null;
  placedOn: string | null;
  status: string;
  outcome: string;
  age: number | null;
  source: string;
  campaign: string;
  qualification: boolean | null;
};

function day(value: string) {
  return value.slice(0, 10);
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return (
    Math.round(
      (sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2) * 10,
    ) / 10
  );
}
function elapsed(from: string, to: string) {
  // Hire and client-offer dates are date-only. Compare calendar days so a
  // same-day application and placement remains a valid zero-day result.
  return Math.max(0, (Date.parse(day(to)) - Date.parse(day(from))) / DAY);
}
const normalized = (value: string) => value.trim().toLowerCase();
export function savedQualification(snapshot: unknown): boolean | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = snapshot as {
    version?: unknown;
    threshold?: unknown;
    qualified?: unknown;
  };
  return value.version === 1 &&
    typeof value.threshold === "number" &&
    Number.isFinite(value.threshold) &&
    typeof value.qualified === "boolean"
    ? value.qualified
    : null;
}
export function sourceLabels(
  value: unknown,
  workspaceId: string,
  fallback: string | null,
) {
  // Saved attribution has no expiry. Its visitor-capture TTL must not erase
  // historical reporting after 30 days.
  const parsed = attributionSchema.safeParse(value);
  const touch =
    parsed.success && parsed.data.workspaceId === workspaceId
      ? parsed.data.last
      : null;
  return {
    source:
      touch?.utm_source ??
      (fallback && !["public_form", "unknown"].includes(fallback)
        ? fallback.replaceAll("_", " ")
        : "Unknown / unattributed"),
    campaign:
      touch?.utm_campaign ?? touch?.campaign_id ?? "No campaign recorded",
    campaignId: touch?.campaign_id ?? "",
  };
}

export function buildAgencyReport(input: {
  workspaceId: string;
  filters: ReportFilters;
  jobs: ReportJob[];
  applications: ReportApplication[];
  transitions: ReportTransition[];
  offers: ReportOffer[];
  now?: Date;
}) {
  const { filters, jobs, applications, offers } = input;
  const now = input.now ?? new Date(),
    today = now.toISOString().slice(0, 10);
  const inPeriod = (value: string | null) =>
    !!value &&
    day(value) >= filters.from &&
    day(value) <= filters.to &&
    Date.parse(value) <= now.getTime();
  const history = new Map<string, ReportTransition[]>();
  for (const transition of input.transitions) {
    if (Date.parse(transition.at) > now.getTime()) continue;
    const rows = history.get(transition.applicationId) ?? [];
    rows.push(transition);
    history.set(transition.applicationId, rows);
  }
  for (const rows of history.values())
    rows.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const offerMap = new Map<string, ReportOffer[]>();
  for (const offer of offers) {
    const rows = offerMap.get(offer.applicationId) ?? [];
    rows.push(offer);
    offerMap.set(offer.applicationId, rows);
  }
  const completedStages = new Map<string, number[]>();
  const records: ReportRecord[] = [];
  const sourceGroups = new Map<
    string,
    {
      source: string;
      campaign: string;
      campaignId: string;
      applications: number;
      qualified: number;
      assessed: number;
      submitted: number;
      offers: number;
      placements: number;
      ids: string[];
    }
  >();
  for (const application of applications) {
    const job = jobMap.get(application.jobId);
    if (!job || Date.parse(application.appliedAt) > now.getTime()) continue;
    const rows = history.get(application.id) ?? [];
    const submittedOn =
      rows.find((row) => normalized(row.stage) === "submitted")?.at ?? null;
    const placedOn =
      application.hiredOn ??
      rows.find((row) => normalized(row.stage) === "hired")?.at ??
      null;
    const last = rows.at(-1);
    // Do not infer current-stage age from an unrelated transition. Legacy
    // applications without history can only be aged from Applied safely.
    const enteredAt =
      last?.stageId === application.stageId
        ? last.at
        : !last && normalized(application.stage) === "applied"
          ? application.appliedAt
          : null;
    const age =
      application.status === "active" && job.status === "open" && enteredAt
        ? elapsed(enteredAt, today)
        : null;
    const source = sourceLabels(
      application.attribution,
      input.workspaceId,
      application.source,
    );
    const outcome =
      application.status === "rejected"
        ? application.rejectionSource === "agency"
          ? "Rejected by Talmore"
          : application.rejectionSource === "client"
            ? "Rejected by client"
            : "Rejection source unknown"
        : application.status === "hired"
          ? "Placed"
          : application.status === "withdrawn"
            ? "Withdrawn"
            : "Still active";
    records.push({
      applicationId: application.id,
      candidateId: application.candidateId,
      name: application.name,
      jobId: job.id,
      job: job.title,
      client: job.clientName ?? "No client assigned",
      stage: application.stage,
      appliedOn: application.appliedAt,
      submittedOn,
      placedOn: placedOn && day(placedOn) <= today ? placedOn : null,
      status: application.status,
      outcome,
      age,
      source: source.source,
      campaign: source.campaign,
      qualification: application.qualification,
    });
    for (let i = 0; i < rows.length - 1; i++) {
      const current = rows[i],
        next = rows[i + 1];
      if (
        !inPeriod(next.at) ||
        ["hired", "rejected", "rejected by client", "withdrawn"].includes(
          normalized(current.stage),
        )
      )
        continue;
      const durations = completedStages.get(current.stage) ?? [];
      durations.push((Date.parse(next.at) - Date.parse(current.at)) / DAY);
      completedStages.set(current.stage, durations);
    }
    if (inPeriod(application.appliedAt)) {
      const key = JSON.stringify([
        source.source,
        source.campaign,
        source.campaignId,
      ]);
      const group = sourceGroups.get(key) ?? {
        ...source,
        applications: 0,
        qualified: 0,
        assessed: 0,
        submitted: 0,
        offers: 0,
        placements: 0,
        ids: [],
      };
      group.applications++;
      group.ids.push(application.id);
      if (application.qualification !== null) group.assessed++;
      if (application.qualification === true) group.qualified++;
      if (submittedOn) group.submitted++;
      if (
        offerMap
          .get(application.id)
          ?.some(
            (offer) => offer.kind === "client" && day(offer.offeredAt) <= today,
          )
      )
        group.offers++;
      if (placedOn && day(placedOn) <= today) group.placements++;
      sourceGroups.set(key, group);
    }
  }
  const periodApplications = records.filter((row) => inPeriod(row.appliedOn));
  const submissions = records.filter((row) => inPeriod(row.submittedOn));
  const placements = records.filter((row) => inPeriod(row.placedOn));
  const applicationIds = new Set(records.map((row) => row.applicationId));
  const recordById = new Map(records.map((row) => [row.applicationId, row]));
  const relevantOffers = offers.filter((offer) =>
    applicationIds.has(offer.applicationId),
  );
  const clientOffers = relevantOffers.filter(
    (offer) => offer.kind === "client" && inPeriod(offer.offeredAt),
  );
  const decisions = relevantOffers.filter(
    (offer) =>
      ["accepted", "declined"].includes(offer.status) &&
      inPeriod(offer.decidedAt),
  );
  const accepted = decisions.filter(
    (offer) => offer.status === "accepted",
  ).length;
  const placementDays = placements
    .filter((row) => day(row.placedOn!) >= day(row.appliedOn))
    .map((row) => elapsed(row.appliedOn, row.placedOn!));
  const submissionDays = placements
    .filter(
      (row) => row.submittedOn && day(row.placedOn!) >= day(row.submittedOn),
    )
    .map((row) => elapsed(row.submittedOn!, row.placedOn!));
  const active = records.filter(
    (row) =>
      row.status === "active" && jobMap.get(row.jobId)?.status === "open",
  );
  const stages = [
    ...new Set([...active.map((row) => row.stage), ...completedStages.keys()]),
  ]
    .map((stage) => {
      const current = active.filter((row) => row.stage === stage),
        ages = current.flatMap((row) => (row.age === null ? [] : [row.age]));
      return {
        stage,
        active: current.length,
        unknownAge: current.length - ages.length,
        medianAge: median(ages),
        overdue: ages.filter((age) => age >= filters.aging).length,
        completed: completedStages.get(stage)?.length ?? 0,
        medianCompleted: median(completedStages.get(stage) ?? []),
      };
    })
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.active - a.active ||
        a.stage.localeCompare(b.stage),
    );
  const delivery = jobs.map((job) => ({
    ...job,
    applications: periodApplications.filter((row) => row.jobId === job.id)
      .length,
    submitted: submissions.filter((row) => row.jobId === job.id).length,
    clientOffers: clientOffers.filter(
      (offer) => recordById.get(offer.applicationId)?.jobId === job.id,
    ).length,
    placements: placements.filter((row) => row.jobId === job.id).length,
    inSubmitted: active.filter(
      (row) => row.jobId === job.id && normalized(row.stage) === "submitted",
    ).length,
  }));
  const days =
    Math.round((Date.parse(filters.to) - Date.parse(filters.from)) / DAY) + 1;
  const bucket = (value: string) =>
    days <= 31
      ? day(value)
      : days <= 100
        ? new Date(
            Date.parse(filters.from) +
              Math.floor(
                (Date.parse(day(value)) - Date.parse(filters.from)) / (7 * DAY),
              ) *
                7 *
                DAY,
          )
            .toISOString()
            .slice(0, 10)
        : value.slice(0, 7);
  const buckets = [
    ...new Set(
      Array.from({ length: days }, (_, i) =>
        bucket(new Date(Date.parse(filters.from) + i * DAY).toISOString()),
      ),
    ),
  ];
  const trend = buckets.map((key) => ({
    key,
    applications: periodApplications.filter(
      (row) => bucket(row.appliedOn) === key,
    ).length,
    submitted: submissions.filter((row) => bucket(row.submittedOn!) === key)
      .length,
    placements: placements.filter((row) => bucket(row.placedOn!) === key)
      .length,
  }));
  const outcomes = [
    "Still active",
    "Placed",
    "Rejected by Talmore",
    "Rejected by client",
    "Rejection source unknown",
    "Withdrawn",
  ].map((label) => ({
    label,
    count: periodApplications.filter((row) => row.outcome === label).length,
  }));
  const submittedOutcomes = outcomes.map(({ label }) => ({
    label,
    count: submissions.filter((row) => row.outcome === label).length,
  }));
  const firstByJob = new Map<string, string>();
  for (const row of records) {
    if (
      row.submittedOn &&
      (!firstByJob.has(row.jobId) ||
        row.submittedOn < firstByJob.get(row.jobId)!)
    )
      firstByJob.set(row.jobId, row.submittedOn);
  }
  const roleSpeed = jobs.map((job) => {
    const takenOn = job.takenOn ?? null,
      firstSubmittedOn = firstByJob.get(job.id) ?? null;
    const invalidOrder =
      !!takenOn && !!firstSubmittedOn && day(firstSubmittedOn) < takenOn;
    return {
      ...job,
      takenOn,
      firstSubmittedOn,
      daysToFirst:
        takenOn && firstSubmittedOn && !invalidOrder
          ? elapsed(takenOn, firstSubmittedOn)
          : null,
      waitingDays:
        takenOn &&
        takenOn <= today &&
        !firstSubmittedOn &&
        job.status !== "closed"
          ? elapsed(takenOn, today)
          : null,
      state: !takenOn
        ? "Approval date unknown"
        : invalidOrder
          ? "Submission predates approval"
          : firstSubmittedOn
            ? "Submitted"
            : job.status !== "closed"
              ? "Awaiting first submission"
              : "Closed without submission",
    };
  });
  const roleCohort = roleSpeed.filter((job) => inPeriod(job.takenOn));
  const firstSubmissionDurations = roleCohort.flatMap((job) =>
    job.daysToFirst === null ? [] : [job.daysToFirst],
  );
  const waitingRoles = roleSpeed
    .filter((job) => job.waitingDays !== null)
    .sort(
      (a, b) =>
        b.waitingDays! - a.waitingDays! || a.title.localeCompare(b.title),
    );
  return {
    roleCohort,
    waitingRoles,
    approvalDateUnknown: roleSpeed.filter((job) => job.takenOn === null).length,
    firstSubmission: {
      rolesTakenOn: roleCohort.length,
      measured: firstSubmissionDurations.length,
      medianDays: median(firstSubmissionDurations),
      awaiting: roleCohort.filter((job) => job.waitingDays !== null).length,
      inconsistentDates: roleCohort.filter(
        (job) => job.state === "Submission predates approval",
      ).length,
    },
    filters,
    generatedAt: now.toISOString(),
    today,
    // Only serialize records needed by period drilldowns. The bounded oldest
    // waiting list is returned separately below.
    records: records.filter(
      (row) =>
        inPeriod(row.appliedOn) ||
        inPeriod(row.submittedOn) ||
        inPeriod(row.placedOn),
    ),
    delivery,
    trend,
    bucketSize: days <= 31 ? "day" : days <= 100 ? "week" : "month",
    stages,
    outcomes,
    submittedOutcomes,
    sources: [...sourceGroups.values()].sort(
      (a, b) =>
        b.applications - a.applications || a.source.localeCompare(b.source),
    ),
    oldest: active
      .filter((row) => row.age !== null && row.age >= filters.aging)
      .sort((a, b) => b.age! - a.age!)
      .slice(0, 20),
    summary: {
      applications: periodApplications.length,
      submitted: submissions.length,
      placements: placements.length,
      clientOffers: clientOffers.length,
      medianPlacementDays: median(placementDays),
      placementSample: placementDays.length,
      medianSubmissionDays: median(submissionDays),
      submissionSample: submissionDays.length,
      accepted,
      declined: decisions.length - accepted,
      offerAcceptance: decisions.length
        ? Math.round((accepted / decisions.length) * 100)
        : null,
      active: active.length,
      inSubmitted: active.filter((row) => normalized(row.stage) === "submitted")
        .length,
      unreviewed: active.filter((row) => normalized(row.stage) === "applied")
        .length,
    },
  };
}
export type AgencyReport = ReturnType<typeof buildAgencyReport>;
