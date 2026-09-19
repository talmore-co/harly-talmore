import Link from "next/link";
import type { Route } from "next";
import { Briefcase, Plus, TrendingUp, Trash2, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listJobsWithStats, listTrashedJobs } from "@/features/jobs/data";
import { JobsTable } from "@/features/jobs/JobsTable";
import { JobsClientFilter } from "@/features/jobs/JobsClientFilter";
import { JobIdentity } from "@/features/jobs/JobIdentity";
import { TrashJobActions } from "@/features/jobs/TrashJobActions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

type JobsPageProps = {
  searchParams: Promise<{ view?: string; clientId?: string }>;
};

const tileClass =
  "rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(28,27,22,0.04)]";

export default async function DashboardJobsPage({
  searchParams,
}: JobsPageProps) {
  await requirePagePermission("jobs:view");
  const { view, clientId = "all" } = await searchParams;
  const isTrash = view === "trash";

  const [allJobs, allTrashed] = await Promise.all([
    listJobsWithStats(),
    listTrashedJobs(),
  ]);
  const matchesClient = (job: { clientId: string | null }) =>
    clientId === "all" ||
    (clientId === "none" ? !job.clientId : job.clientId === clientId);
  const jobs = allJobs.filter(matchesClient),
    trashed = allTrashed.filter(matchesClient);
  const clientOptions = [
    ...new Map(
      [...allJobs, ...allTrashed]
        .filter((job) => job.clientId)
        .map((job) => [
          job.clientId!,
          { id: job.clientId!, name: job.clientName ?? "Unknown client" },
        ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const clientFilter = (
    <JobsClientFilter value={clientId} options={clientOptions} />
  );
  const clientQuery =
    clientId !== "all" ? `clientId=${encodeURIComponent(clientId)}` : "";

  const openRoles = jobs.filter((j) => j.status === "open").length;
  const draftRoles = jobs.filter((j) => j.status === "draft").length;
  const totalApplicants = jobs.reduce((sum, j) => sum + j.applicants, 0);
  const newApplicants = jobs.reduce((sum, j) => sum + j.newApplicants, 0);

  return (
    <div className="space-y-5">
      {!isTrash && jobs.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="duration-500 animate-in fade-in slide-in-from-bottom-2">
            <StatTile
              label="Open roles"
              value={openRoles}
              hint={`${draftRoles} draft`}
              icon={Briefcase}
            />
          </div>
          <div className="delay-75 duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards">
            <StatTile
              label="Applicants"
              value={totalApplicants}
              hint={
                clientId === "all"
                  ? "across all roles"
                  : "across this client selection"
              }
              icon={Users}
            />
          </div>
          <div className="delay-150 duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards">
            <StatTile
              label="New this week"
              value={newApplicants}
              hint="applied in 7d"
              icon={TrendingUp}
              accent
            />
          </div>
          <div className="delay-200 duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards">
            <StatTile
              label="Total roles"
              value={jobs.length}
              hint={`${draftRoles} not published`}
              icon={Briefcase}
            />
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg border bg-card p-1 text-sm">
          <Tab
            href={`/dashboard/jobs${clientQuery ? `?${clientQuery}` : ""}`}
            active={!isTrash}
          >
            All jobs
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {jobs.length}
            </span>
          </Tab>
          <Tab
            href={`/dashboard/jobs?view=trash${clientQuery ? `&${clientQuery}` : ""}`}
            active={isTrash}
          >
            <Trash2 className="size-3.5" />
            Trash
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {trashed.length}
            </span>
          </Tab>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/jobs/new">
            <Plus className="size-4" />
            New job
          </Link>
        </Button>
      </div>

      {isTrash ? (
        <div className="flex flex-wrap gap-2">{clientFilter}</div>
      ) : null}
      {isTrash ? (
        trashed.length > 0 ? (
          <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
            {trashed.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0">
                  <JobIdentity
                    title={job.title}
                    department={job.department}
                    location={job.location}
                    deletedAt={job.deletedAt}
                    muted
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.clientName ?? "No client assigned"}
                  </p>
                </div>
                <TrashJobActions jobId={job.id} jobTitle={job.title} />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={Trash2}
            title={
              clientId === "all"
                ? "Trash is empty"
                : "No trashed jobs for this client selection"
            }
            description="Jobs you move to the trash show up here and can be restored."
          />
        )
      ) : allJobs.length > 0 || clientId !== "all" ? (
        <JobsTable jobs={jobs} clientFilter={clientFilter} />
      ) : (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Create your first opening. Harly adds the default hiring stages automatically."
          action={{ href: "/dashboard/jobs/new", label: "Create job" }}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Briefcase;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        tileClass,
        "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md",
        accent && "border-primary/25 bg-accent/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-colors duration-200",
            accent
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      className={cn(
        "flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
