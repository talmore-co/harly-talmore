"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toSafeCsv } from "@/lib/csv";
import { TrendChart } from "./charts";
import { RecruiterReport } from "./RecruiterReport";
import type { AgencyReportsData } from "./agency-data";
import type { ReportFilters, ReportRecord } from "./agency-metrics";

const ranges = [
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["365", "Last 12 months"],
  ["month", "This month"],
  ["last-month", "Last month"],
  ["custom", "Custom dates"],
];
const days = (value: number | null) =>
  value === null ? "No data" : `${value}d`;
const date = (value: string | null) => value?.slice(0, 10) ?? "—";
const pct = (value: number, total: number) =>
  total ? `${Math.round((value / total) * 100)}%` : "—";

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-hairline bg-card p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}
function Metric({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  hint: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="my-2 block text-2xl font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:underline"
        >
          {value}
        </button>
      ) : (
        <p
          className={cn(
            "my-2",
            value === "No data"
              ? "text-sm text-muted-foreground"
              : "text-2xl font-semibold tabular-nums",
          )}
        >
          {value}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ReportsDashboard({ data }: { data: AgencyReportsData }) {
  const router = useRouter(),
    { filters, summary } = data;
  const [custom, setCustom] = useState(filters.range === "custom");
  const [from, setFrom] = useState(filters.from),
    [to, setTo] = useState(filters.to);
  const [detail, setDetail] = useState<{
    title: string;
    rows: ReportRecord[];
  } | null>(null);
  const period = (value: string | null) =>
    !!value &&
    value.slice(0, 10) >= filters.from &&
    value.slice(0, 10) <= filters.to;
  const periodApplications = data.records.filter((row) =>
    period(row.appliedOn),
  );
  const submissions = data.records.filter((row) => period(row.submittedOn));
  const placements = data.records.filter((row) => period(row.placedOn));
  const open = (title: string, rows: ReportRecord[]) =>
    setDetail({ title, rows });
  function href(changes: Partial<ReportFilters>) {
    const values = { ...filters, ...changes },
      params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) =>
      params.set(key, String(value)),
    );
    return `/dashboard/reports?${params}` as Route;
  }
  function change(changes: Partial<ReportFilters>) {
    setDetail(null);
    router.push(href(changes));
  }
  function download(rows: (string | number)[][], name: string) {
    const blob = new Blob(
      ["\uFEFF" + toSafeCsv(rows.map((row) => row.map(String)))],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `talmore-${name}-${filters.from}-${filters.to}.csv`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 0);
  }
  function exportReport() {
    if (filters.tab === "recruiters") {
      download([
        ["Period from", "Period to", "Recruiter", "Assigned jobs (current)", "Completed interviews", "Assessments submitted", "Tasks completed (current owner)", "First submissions recorded", "First hires recorded", "Overdue tasks (current)", "Completed interviews missing own assessment"],
        ...data.recruiters.map((row) => [filters.from, filters.to, row.name, row.jobs, row.interviews, row.assessments, row.tasksCompleted, row.submissions, row.placements, row.overdueTasks, row.missingAssessments.length]),
      ], "recruiters");
      return;
    }
    const rows: (string | number)[][] = [
      ["Report", "Agency delivery"],
      ["From (UTC, inclusive)", filters.from],
      ["To (UTC, inclusive)", filters.to],
      ["Generated at", data.generatedAt],
      [
        "Client filter",
        filters.client === "all"
          ? "All clients"
          : filters.client === "none"
            ? "No client assigned"
            : (data.options.clients.find(
                (client) => client.id === filters.client,
              )?.name ?? filters.client),
      ],
      [
        "Job filter",
        filters.job === "all"
          ? "All jobs"
          : (data.options.jobs.find((job) => job.id === filters.job)?.title ??
            filters.job),
      ],
      [
        "Client grouping",
        "Current job assignment, including historical activity",
      ],
      [],
      ["Period activity", "Value"],
      ["Applications received", summary.applications],
      ["First submissions", summary.submitted],
      ["Client offer records", summary.clientOffers],
      ["Placements confirmed", summary.placements],
      [
        "Median application to placement (days)",
        summary.medianPlacementDays ?? "",
      ],
      ["Valid placement durations", summary.placementSample],
      [
        "Median submission to placement (days)",
        summary.medianSubmissionDays ?? "",
      ],
      ["Valid submission durations", summary.submissionSample],
      ["Offers accepted by decision date", summary.accepted],
      ["Offers declined by decision date", summary.declined],
      [],
      ["Roles taken on in period", data.firstSubmission.rolesTakenOn],
      [
        "Median role approval to first submission (calendar days)",
        data.firstSubmission.medianDays ?? "",
      ],
      [
        "Roles with valid first-submission duration",
        data.firstSubmission.measured,
      ],
      [
        "Cohort unclosed roles awaiting first submission",
        data.firstSubmission.awaiting,
      ],
      [
        "Cohort submissions predating approval",
        data.firstSubmission.inconsistentDates,
      ],
      [
        "Selected jobs with unknown approval date (all dates)",
        data.approvalDateUnknown,
      ],
      [],
      [
        "Role cohort: client",
        "Job",
        "Taken on",
        "First submission",
        "Days to first submission",
        "Current state",
      ],
      ...data.roleCohort.map((row) => [
        row.clientName ?? "No client assigned",
        row.title,
        row.takenOn ?? "",
        date(row.firstSubmittedOn),
        row.daysToFirst ?? "",
        row.state,
      ]),
      [],
      [
        "Waiting roles as of today: client",
        "Job",
        "Taken on",
        "Calendar days waiting",
      ],
      ...data.waitingRoles.map((row) => [
        row.clientName ?? "No client assigned",
        row.title,
        row.takenOn ?? "",
        row.waitingDays ?? "",
      ]),
      [],
      [
        "Client",
        "Job",
        "Applications received",
        "First submissions",
        "Client offer records",
        "Placements confirmed",
        "Currently Submitted (open jobs)",
      ],
      ...data.delivery.map((row) => [
        row.clientName ?? "No client assigned",
        row.title,
        row.applications,
        row.submitted,
        row.clientOffers,
        row.placements,
        row.inSubmitted,
      ]),
      [],
      ["Trend bucket", "Applications", "First submissions", "Placements"],
      ...data.trend.map((row) => [
        row.key,
        row.applications,
        row.submitted,
        row.placements,
      ]),
      [],
      [
        "Source (latest saved touch)",
        "Campaign",
        "Campaign ID",
        "Applications received in period",
        "Questionnaire-qualified",
        "Known threshold result",
        "Ever submitted",
        "Ever received client offer",
        "Ever placed",
        "Placement conversion",
      ],
      ...data.sources.map((row) => [
        row.source,
        row.campaign,
        row.campaignId,
        row.applications,
        row.qualified,
        row.assessed,
        row.submitted,
        row.offers,
        row.placements,
        pct(row.placements, row.applications),
      ]),
      [],
      [
        "Stage",
        "Active now (open jobs)",
        "Median age (days)",
        `Waiting ${filters.aging}+ days`,
        "Unknown age",
        "Stage exits in period",
        "Median completed stay (days)",
      ],
      ...data.stages.map((row) => [
        row.stage,
        row.active,
        row.medianAge ?? "",
        row.overdue,
        row.unknownAge,
        row.completed,
        row.medianCompleted ?? "",
      ]),
      [],
      ["Current outcome", "Application cohort", "Submission cohort"],
      ...data.outcomes.map((row, index) => [
        row.label,
        row.count,
        data.submittedOutcomes[index].count,
      ]),
      [],
      [
        "Placement candidate",
        "Job",
        "Client (current assignment)",
        "Application date",
        "First submission",
        "Placement confirmation",
      ],
      ...placements.map((row) => [
        row.name,
        row.job,
        row.client,
        date(row.appliedOn),
        date(row.submittedOn),
        date(row.placedOn),
      ]),
    ];
    download(rows, "reports");
  }
  const jobOptions = data.options.jobs.filter(
    (job) =>
      filters.client === "all" ||
      (filters.client === "none"
        ? !job.clientId
        : job.clientId === filters.client),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agency delivery, client outcomes and source quality.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportReport}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Period
          <Select
            value={custom ? "custom" : filters.range}
            onValueChange={(value) => {
              setCustom(value === "custom");
              if (value !== "custom") change({ range: value });
            }}
          >
            <SelectTrigger aria-label="Report period" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ranges.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          Client
          <Select
            value={filters.client}
            onValueChange={(client) => change({ client, job: "all" })}
          >
            <SelectTrigger
              aria-label="Report client"
              className="w-52 max-w-[calc(100vw-2rem)]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              <SelectItem value="none">No client assigned</SelectItem>
              {data.options.clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          Job
          <Select value={filters.job} onValueChange={(job) => change({ job })}>
            <SelectTrigger
              aria-label="Report job"
              className="w-64 max-w-[calc(100vw-2rem)]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {jobOptions.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {custom ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              change({ range: "custom", from, to });
            }}
          >
            <label className="space-y-1 text-xs text-muted-foreground">
              From
              <DatePicker
                aria-label="Report from date"
                required
                value={from}
                max={to}
                onChange={setFrom}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              To
              <DatePicker
                aria-label="Report to date"
                required
                value={to}
                min={from}
                max={data.today}
                onChange={setTo}
              />
            </label>
            <Button type="submit" variant="outline">
              Apply dates
            </Button>
          </form>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {filters.from} to {filters.to}, inclusive · UTC calendar dates ·
        Current-state sections are as of {data.today}.
      </p>
      <nav
        aria-label="Report views"
        className="flex max-w-full gap-1 overflow-x-auto border-b"
      >
        {(
          [
            ["overview", "Overview"],
            ["clients", "Clients & jobs"],
            ["sources", "Sources"],
            ["recruiters", "Recruiters"],
          ] as const
        ).map(([tab, label]) => (
          <Link
            key={tab}
            href={href({ tab })}
            aria-current={filters.tab === tab ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2 text-sm",
              filters.tab === tab
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {filters.tab === "recruiters" && <RecruiterReport rows={data.recruiters} />}
      {filters.tab === "overview" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Metric
              label="Time to first submission"
              value={days(data.firstSubmission.medianDays)}
              hint={`Median · ${data.firstSubmission.measured} of ${data.firstSubmission.rolesTakenOn} roles taken on in this period measured`}
            />
            <Metric
              label="Applications received"
              value={summary.applications}
              hint="Applications dated in this period"
              onClick={() => open("Applications received", periodApplications)}
            />
            <Metric
              label="Submitted to clients"
              value={summary.submitted}
              hint="First entry into Submitted, once per application"
              onClick={() => open("First submissions", submissions)}
            />
            <Metric
              label="Placements confirmed"
              value={summary.placements}
              hint="Confirmation date, not employment start date"
              onClick={() => open("Placements confirmed", placements)}
            />
            <Metric
              label="Application to placement"
              value={days(summary.medianPlacementDays)}
              hint={`Median · ${summary.placementSample} valid placement durations`}
            />
          </div>
          <Panel
            title="Roles awaiting first submission"
            description={`As of today, across all approval dates within the selected clients and jobs. ${data.waitingRoles.length} roles have no recorded submission. Includes approved draft jobs; closed jobs are excluded.`}
          >
            <p className="text-sm text-muted-foreground">
              {data.approvalDateUnknown} selected jobs have no approval date and
              cannot be timed. Enter the client’s approval date in the job
              editor.
            </p>
            <RoleSpeedTable rows={data.waitingRoles} waiting />
            <Link
              href={href({ tab: "clients" })}
              className="inline-block text-sm underline"
            >
              View first-submission results for roles taken on in this period
            </Link>
          </Panel>
          <Panel
            title="Delivery trend"
            description={`Period activity by ${data.bucketSize}. Applications, first submissions and placements may involve different people; these totals are not a conversion funnel.`}
          >
            <TrendChart
              series={[
                {
                  key: "applications",
                  label: "Applications",
                  color: "var(--chart-1)",
                  points: data.trend.map((row) => ({
                    label: row.key.slice(5),
                    sub: row.key,
                    value: row.applications,
                  })),
                },
                {
                  key: "submitted",
                  label: "Submissions",
                  color: "var(--chart-3)",
                  points: data.trend.map((row) => ({
                    label: row.key.slice(5),
                    sub: row.key,
                    value: row.submitted,
                  })),
                },
                {
                  key: "placements",
                  label: "Placements",
                  color: "var(--chart-2)",
                  points: data.trend.map((row) => ({
                    label: row.key.slice(5),
                    sub: row.key,
                    value: row.placements,
                  })),
                },
              ]}
            />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Current pipeline"
              description="As of today, active applications on open jobs. Scoring does not count as a recruiter review."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Active applications"
                  value={summary.active}
                  hint="Across selected open jobs"
                />
                <Metric
                  label="Still in Applied"
                  value={summary.unreviewed}
                  hint="Awaiting a stage move"
                />
                <Metric
                  label="Currently Submitted"
                  value={summary.inSubmitted}
                  hint="Not necessarily awaiting feedback"
                />
              </div>
            </Panel>
            <Panel
              title="Offer decisions"
              description="Both client-offer records and offers sent through Talmore. Only decisions dated in the selected period count."
            >
              {summary.offerAcceptance === null ? (
                <p className="text-sm text-muted-foreground">
                  No offer decisions in this period.
                </p>
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {summary.offerAcceptance}% accepted
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {summary.offerAcceptance !== null
                  ? `${summary.accepted} accepted · ${summary.declined} declined. `
                  : ""}
                Pending, withdrawn and placements without offers are excluded.
              </p>
            </Panel>
          </div>
          <Panel
            title="Stage bottlenecks"
            description="Current waiting time is separate from completed stays. Completed stays count stage exits during the selected period, including repeat visits."
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Flag waiting time</span>
              <Select
                value={String(filters.aging)}
                onValueChange={(value) => change({ aging: Number(value) })}
              >
                <SelectTrigger
                  className="w-32"
                  aria-label="Waiting time threshold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[7, 14, 30].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}+ days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Stage",
                    "Active now",
                    "Median age",
                    `${filters.aging}+ days`,
                    "Unknown age",
                    "Completed stays",
                    "Median completed stay",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stages.map((row) => (
                  <TableRow key={row.stage}>
                    <TableCell>{row.stage}</TableCell>
                    <TableCell>{row.active}</TableCell>
                    <TableCell>{days(row.medianAge)}</TableCell>
                    <TableCell>{row.overdue}</TableCell>
                    <TableCell>{row.unknownAge}</TableCell>
                    <TableCell>{row.completed}</TableCell>
                    <TableCell>{days(row.medianCompleted)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.stages.length ? (
              <Empty>No active applications or stage exits to report.</Empty>
            ) : null}
          </Panel>
          <Panel
            title="Oldest waiting applications"
            description={`Up to 20 active applications on open jobs waiting ${filters.aging}+ days in their current stage. Unknown stage ages are excluded.`}
          >
            <RecordTable rows={data.oldest} aging />
          </Panel>
          <Panel
            title="Application outcomes"
            description="Applications received in the selected period, with their current outcome as of today. These are cohort outcomes, not decisions made during the period."
          >
            <OutcomeList
              values={data.outcomes}
              total={periodApplications.length}
              onClick={(label) =>
                open(
                  label,
                  periodApplications.filter((row) => row.outcome === label),
                )
              }
            />
          </Panel>
        </>
      ) : null}

      {filters.tab === "clients" ? (
        <>
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Client grouping follows each job’s current client assignment,
            including historical activity. Relinking a job changes its report
            grouping. Original client identities remain on individual
            client-offer records.
          </p>
          <Panel
            title="Time to first submission"
            description="Roles taken on during the selected period, followed through to their first candidate submission as of today. The clock starts when the client approves Talmore to recruit."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Median first submission"
                value={days(data.firstSubmission.medianDays)}
                hint={`${data.firstSubmission.measured} roles with valid durations`}
              />
              <Metric
                label="Roles taken on"
                value={data.firstSubmission.rolesTakenOn}
                hint="Approval date in the selected period"
              />
              <Metric
                label="Still awaiting submission"
                value={data.firstSubmission.awaiting}
                hint="Unclosed roles in this approval cohort"
              />
            </div>
            <RoleSpeedTable rows={data.roleCohort} />
            <p className="text-xs text-muted-foreground">
              Calendar days; same-day submission is 0 days.{" "}
              {data.approvalDateUnknown} selected jobs have unknown approval
              dates and are excluded from this cohort.{" "}
              {data.firstSubmission.inconsistentDates} roles have submissions
              predating approval and are excluded from the median. Reopening a
              job or resubmitting a candidate does not reset the clock.
            </p>
          </Panel>
          <Panel
            title="Client and job delivery"
            description="Period activity, plus a separately labeled current Submitted count. Includes open, closed and draft jobs you can access."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Client / job",
                    "Applications",
                    "First submissions",
                    "Client offer records",
                    "Placements",
                    "Submitted now",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.delivery.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="text-xs text-muted-foreground">
                        {row.clientName ?? "No client assigned"} · {row.status}
                      </p>
                      <Link
                        href={href({ job: row.id })}
                        className="font-medium hover:underline"
                      >
                        {row.title}
                      </Link>
                      <Link
                        href={`/dashboard/pipeline?jobId=${row.id}` as Route}
                        className="ml-3 text-xs underline"
                      >
                        Pipeline
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Count
                        value={row.applications}
                        onClick={() =>
                          open(
                            `${row.title}: applications`,
                            periodApplications.filter(
                              (record) => record.jobId === row.id,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Count
                        value={row.submitted}
                        onClick={() =>
                          open(
                            `${row.title}: submissions`,
                            submissions.filter(
                              (record) => record.jobId === row.id,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{row.clientOffers}</TableCell>
                    <TableCell>
                      <Count
                        value={row.placements}
                        onClick={() =>
                          open(
                            `${row.title}: placements`,
                            placements.filter(
                              (record) => record.jobId === row.id,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{row.inSubmitted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.delivery.length ? (
              <Empty>No jobs match these filters.</Empty>
            ) : null}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Submission outcomes"
              description="Applications first submitted during the selected period, with their current outcome as of today."
            >
              <OutcomeList
                values={data.submittedOutcomes}
                total={submissions.length}
                onClick={(label) =>
                  open(
                    `Submitted: ${label}`,
                    submissions.filter((row) => row.outcome === label),
                  )
                }
              />
            </Panel>
            <Panel
              title="Submission to placement"
              description="Placements confirmed during this period with a recorded first submission."
            >
              {summary.medianSubmissionDays === null ? (
                <p className="text-sm text-muted-foreground">
                  No placement durations to report in this period.
                </p>
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {days(summary.medianSubmissionDays)}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {summary.submissionSample > 0
                  ? `Median across ${summary.submissionSample} valid durations. `
                  : ""}
                Placements without a submission history are excluded.
              </p>
              <p className="text-sm text-muted-foreground">
                A placement does not require an accepted or recorded offer.
              </p>
            </Panel>
          </div>
          <Panel
            title="Placements confirmed"
            description="Explicit hire date when present, otherwise the first recorded Hired transition. This is not a start-date or revenue report."
          >
            <RecordTable rows={placements} />
          </Panel>
        </>
      ) : null}

      {filters.tab === "sources" ? (
        <Panel
          title="Source and campaign quality"
          description="Applications received in this period, with outcomes as of today. Each application counts once per outcome."
        >
          <p className="text-sm text-muted-foreground">
            Latest saved attribution, with import/referral source as a fallback.
            Untagged public applications are Unknown / unattributed.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Source / campaign",
                  "Applications",
                  "Questionnaire-qualified",
                  "Submitted",
                  "Client offer",
                  "Placed",
                  "Placement conversion",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.map((row) => (
                <TableRow
                  key={JSON.stringify([
                    row.source,
                    row.campaign,
                    row.campaignId,
                  ])}
                >
                  <TableCell>
                    <p className="font-medium">{row.source}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.campaign}
                    </p>
                    {row.campaignId ? (
                      <p className="text-xs text-muted-foreground">
                        ID: {row.campaignId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Count
                      value={row.applications}
                      onClick={() => {
                        const ids = new Set(row.ids);
                        open(
                          `${row.source} · ${row.campaign}`,
                          periodApplications.filter((record) =>
                            ids.has(record.applicationId),
                          ),
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {row.qualified}
                    <p className="text-xs text-muted-foreground">
                      {row.assessed} with saved threshold result
                    </p>
                  </TableCell>
                  <TableCell>{row.submitted}</TableCell>
                  <TableCell>{row.offers}</TableCell>
                  <TableCell>{row.placements}</TableCell>
                  <TableCell>
                    {pct(row.placements, row.applications)}
                    <p className="text-xs text-muted-foreground">
                      {row.placements} / {row.applications}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.sources.length ? (
            <Empty>
              No applications received during this period match your filters.
            </Empty>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Questionnaire qualification uses the result and threshold saved at
            submission. Missing results are unknown, not failures. Qualification
            is separate from AI fit and recruiter approval. Recent cohorts may
            still be progressing.
          </p>
        </Panel>
      ) : null}
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Metric definitions and coverage
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            Source attribution is visitor-provided, not Meta-verified. Saved
            attribution does not expire from reports. Questionnaire
            qualification is the saved submission result, not AI fit or
            recruiter approval.
          </p>
          <p>
            Counts are applications, not distinct people. Submissions use first
            entry into the Submitted stage. Custom stages appear in bottleneck
            reporting; only a stage named Submitted counts as a submission.
          </p>
          <p>
            Placement dates prefer the explicit confirmation date, otherwise the
            first Hired transition. Historical placement events remain counted
            if an application is later reopened; current outcomes reflect its
            current status. Missing historical events are not invented.
          </p>
          <p>
            Client offers are actual records, dated by their offer date. Offer
            acceptance is accepted ÷ accepted plus declined, using decision
            dates. No decision date means exclusion from period acceptance.
          </p>
          <p>
            Filters apply to period activity and cohort selection. Current
            pipeline sections deliberately ignore the date range and show
            today’s state within the selected jobs and clients. Durations use
            calendar days for date-only placement dates; completed stage stays
            use elapsed time.
          </p>
          <p>
            Trashed jobs and candidates are excluded. Job assignment, department
            and region access restrictions apply. Historical activity is grouped
            by the job’s current client, not a frozen placement-client identity.
          </p>
        </div>
      </details>
      <Sheet
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>{detail?.title ?? "Report records"}</SheetTitle>
            <SheetDescription>
              {detail?.rows.length ?? 0} applications. Dates are UTC; outcome is
              current.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  [
                    [
                      "Candidate",
                      "Job",
                      "Client (current assignment)",
                      "Application",
                      "First submission",
                      "Placement",
                      "Current outcome",
                    ],
                    ...(detail?.rows ?? []).map((row) => [
                      row.name,
                      row.job,
                      row.client,
                      date(row.appliedOn),
                      date(row.submittedOn),
                      date(row.placedOn),
                      row.outcome,
                    ]),
                  ],
                  "report-records",
                )
              }
            >
              <Download className="size-4" />
              Export records
            </Button>
            <RecordTable rows={detail?.rows ?? []} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
function Count({ value, onClick }: { value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-8 rounded px-1 py-1 text-left tabular-nums underline underline-offset-4 hover:bg-muted"
      aria-label={`View ${value} applications`}
    >
      {value}
    </button>
  );
}
function OutcomeList({
  values,
  total,
  onClick,
}: {
  values: { label: string; count: number }[];
  total: number;
  onClick: (label: string) => void;
}) {
  return (
    <div className="divide-y">
      {values.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span>{row.label}</span>
          <span>
            <Count value={row.count} onClick={() => onClick(row.label)} />{" "}
            <span className="text-muted-foreground">
              {pct(row.count, total)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
function RoleSpeedTable({
  rows,
  waiting = false,
}: {
  rows: AgencyReportsData["roleCohort"];
  waiting?: boolean;
}) {
  if (!rows.length)
    return (
      <Empty>
        {waiting
          ? "No dated roles are awaiting their first submission."
          : "No roles have a recorded approval date in this period."}
      </Empty>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client / role</TableHead>
          <TableHead>Taken on</TableHead>
          {waiting ? (
            <TableHead>Days waiting</TableHead>
          ) : (
            <>
              <TableHead>First submission</TableHead>
              <TableHead>Days to first</TableHead>
              <TableHead>Current state</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <p className="text-xs text-muted-foreground">
                {row.clientName ?? "No client assigned"}
              </p>
              <Link
                className="font-medium hover:underline"
                href={`/dashboard/jobs/${row.id}` as Route}
              >
                {row.title}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {date(row.takenOn)}
            </TableCell>
            {waiting ? (
              <TableCell>{row.waitingDays}</TableCell>
            ) : (
              <>
                <TableCell className="whitespace-nowrap">
                  {date(row.firstSubmittedOn)}
                </TableCell>
                <TableCell>{row.daysToFirst ?? "—"}</TableCell>
                <TableCell>{row.state}</TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RecordTable({
  rows,
  aging = false,
}: {
  rows: ReportRecord[];
  aging?: boolean;
}) {
  if (!rows.length) return <Empty>No applications to show.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Candidate / job</TableHead>
          {aging ? (
            <>
              <TableHead>Current stage</TableHead>
              <TableHead>Days waiting</TableHead>
            </>
          ) : (
            <>
              <TableHead>Applied</TableHead>
              <TableHead>First submitted</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Current outcome</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.applicationId}>
            <TableCell>
              <Link
                href={`/dashboard/candidates/${row.candidateId}` as Route}
                className="font-medium hover:underline"
              >
                {row.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {row.job} · {row.client}
              </p>
            </TableCell>
            {aging ? (
              <>
                <TableCell>{row.stage}</TableCell>
                <TableCell>{row.age}</TableCell>
              </>
            ) : (
              <>
                <TableCell className="whitespace-nowrap">
                  {date(row.appliedOn)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {date(row.submittedOn)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {date(row.placedOn)}
                </TableCell>
                <TableCell>{row.outcome}</TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
