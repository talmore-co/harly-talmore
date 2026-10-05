"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Search } from "lucide-react";

import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";
import { JobIdentity } from "@/features/jobs/JobIdentity";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import { pipelineStageColor } from "@/features/pipeline/stage-color";
import { rememberJobsListQuery } from "@/features/jobs/list-return";
import { replaceUrlParams } from "@/lib/url-params";

export type JobRow = {
  clientId: string | null;
  clientName: string | null;
  id: string;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
  status: "draft" | "open" | "closed";
  applicants: number;
  activeApplicants: number;
  newApplicants: number;
  stages: { id: string; name: string; color: string | null; count: number }[];
  createdAt: Date;
};

type SortKey = "recent" | "oldest" | "candidates" | "title";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v && v.trim()))),
  ).sort((a, b) => a.localeCompare(b));
}

const STATUS_OPTIONS = ["open", "inactive", "draft", "closed"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Active (open)",
  inactive: "Inactive",
  closed: "Closed",
};

const EMPLOYMENT_OPTIONS = ["full_time", "part_time", "contract", "internship"];
const WORKPLACE_OPTIONS = ["remote", "hybrid", "onsite"];

const SORT_OPTIONS = ["recent", "oldest", "candidates", "title"];
const SORT_LABELS: Record<string, string> = {
  recent: "Most recent",
  oldest: "Oldest",
  candidates: "Most candidates",
  title: "Title A–Z",
};

export function JobsTable({
  jobs,
  clientFilter,
  showClient = true,
}: {
  jobs: JobRow[];
  clientFilter?: ReactNode;
  showClient?: boolean;
}) {
  const departments = useMemo(
    () => uniqueSorted(jobs.map((j) => j.department)),
    [jobs],
  );

  // Filters, sort and search live in the URL (q, status, dept, type,
  // workplace, sort) so they survive opening a job and coming back. Local
  // state keeps typing responsive; every change is mirrored into the URL.
  const searchParams = useSearchParams();
  const fromUrl = (key: string, allowed: string[], fallback: string) => {
    const value = searchParams.get(key);
    return value && allowed.includes(value) ? value : fallback;
  };
  const [query, setQueryState] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatusState] = useState(() =>
    fromUrl("status", STATUS_OPTIONS, FILTER_ALL),
  );
  const [dept, setDeptState] = useState(() =>
    fromUrl("dept", departments, FILTER_ALL),
  );
  const [employment, setEmploymentState] = useState(() =>
    fromUrl("type", EMPLOYMENT_OPTIONS, FILTER_ALL),
  );
  const [workplace, setWorkplaceState] = useState(() =>
    fromUrl("workplace", WORKPLACE_OPTIONS, FILTER_ALL),
  );
  const [sortKey, setSortKeyState] = useState<SortKey>(
    () => fromUrl("sort", SORT_OPTIONS, "recent") as SortKey,
  );

  const urlValue = (value: string) => (value === FILTER_ALL ? null : value);
  const setQuery = (value: string) => {
    setQueryState(value);
    replaceUrlParams({ q: value.trim() || null });
  };
  const setStatus = (value: string) => {
    setStatusState(value);
    replaceUrlParams({ status: urlValue(value) });
  };
  const setDept = (value: string) => {
    setDeptState(value);
    replaceUrlParams({ dept: urlValue(value) });
  };
  const setEmployment = (value: string) => {
    setEmploymentState(value);
    replaceUrlParams({ type: urlValue(value) });
  };
  const setWorkplace = (value: string) => {
    setWorkplaceState(value);
    replaceUrlParams({ workplace: urlValue(value) });
  };
  const setSortKey = (value: SortKey) => {
    setSortKeyState(value);
    replaceUrlParams({ sort: value === "recent" ? null : value });
  };

  // The job editor's "Jobs" button returns to the jobs list with the same
  // query. This table also renders on a client's page, which must not
  // overwrite it.
  const onJobsList = usePathname() === "/dashboard/jobs";
  const currentQuery = searchParams.toString();
  useEffect(() => {
    if (onJobsList) rememberJobsListQuery(currentQuery);
  }, [onJobsList, currentQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = jobs.filter((j) => {
      if (q) {
        const haystack = [
          j.title,
          j.department,
          j.location,
          ...(showClient ? [j.clientName] : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (
        status === "inactive"
          ? j.status === "open"
          : status !== FILTER_ALL && j.status !== status
      )
        return false;
      if (dept !== FILTER_ALL && j.department !== dept) return false;
      if (employment !== FILTER_ALL && j.employmentType !== employment)
        return false;
      if (workplace !== FILTER_ALL && j.workplaceType !== workplace)
        return false;
      return true;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "candidates") return b.applicants - a.applicants;
      if (sortKey === "oldest")
        return a.createdAt.getTime() - b.createdAt.getTime();
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [jobs, query, status, dept, employment, workplace, sortKey, showClient]);

  const filtersActive =
    status !== FILTER_ALL ||
    dept !== FILTER_ALL ||
    employment !== FILTER_ALL ||
    workplace !== FILTER_ALL ||
    query.trim() !== "";

  function clearFilters() {
    setQueryState("");
    setStatusState(FILTER_ALL);
    setDeptState(FILTER_ALL);
    setEmploymentState(FILTER_ALL);
    setWorkplaceState(FILTER_ALL);
    replaceUrlParams({
      q: null,
      status: null,
      dept: null,
      type: null,
      workplace: null,
    });
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search jobs"
          placeholder={
            showClient
              ? "Search jobs by title, client, department or location…"
              : "Search this client’s jobs…"
          }
          className="h-11 rounded-full pl-11"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {clientFilter}
        <FilterPill
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          labelMap={STATUS_LABELS}
        />
        <FilterPill
          label="Department"
          value={dept}
          onChange={setDept}
          options={departments}
        />
        <FilterPill
          label="Type"
          value={employment}
          onChange={setEmployment}
          options={EMPLOYMENT_OPTIONS}
          labelMap={Object.fromEntries(
            EMPLOYMENT_OPTIONS.map((o) => [o, formatEmploymentType(o)]),
          )}
        />
        <FilterPill
          label="Workplace"
          value={workplace}
          onChange={setWorkplace}
          options={WORKPLACE_OPTIONS}
          labelMap={Object.fromEntries(
            WORKPLACE_OPTIONS.map((o) => [o, formatWorkplaceType(o)]),
          )}
        />
        <FilterPill
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={SORT_OPTIONS}
          labelMap={SORT_LABELS}
          allValue="recent"
        />
        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="rounded-full text-muted-foreground"
          >
            Clear
          </Button>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          {filtered.length === 1 ? "job" : "jobs"}
        </p>
      </div>

      {/* List */}
      <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
        {filtered.map((job) => (
          <div
            key={job.id}
            className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 px-4 py-5 transition-colors hover:bg-muted/20 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
          >
            <Link
              href={`/dashboard/jobs/${job.id}` as Route}
              className="min-w-0"
            >
              <JobIdentity
                title={job.title}
                department={job.department}
                location={job.location}
              />
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:pl-12">
                {showClient && <><span>{job.clientName ?? "No client assigned"}</span><span aria-hidden="true">·</span></>}
                <span>{formatEmploymentType(job.employmentType)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatWorkplaceType(job.workplaceType)}</span>
              </p>
            </Link>

            <div className="col-span-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:col-span-1 lg:pt-1">
              <div className="flex items-baseline gap-3">
                <Link
                  href={`/dashboard/pipeline?job=${job.id}` as Route}
                  aria-label={`Open pipeline for ${job.title}: ${job.applicants} ${job.applicants === 1 ? "candidate" : "candidates"}`}
                  className="rounded-sm text-sm font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {job.applicants} <span className="text-xs font-normal text-muted-foreground">{job.applicants === 1 ? "candidate" : "candidates"}</span>
                </Link>
                {job.newApplicants > 0 ? (
                  <span className="text-[0.65rem] font-medium text-primary">
                    <span title="Added in the last 7 days">+{job.newApplicants} new</span>
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {job.activeApplicants} active
              </p>
            </div>

            <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 lg:col-auto lg:row-auto">
              <JobStatusBadge status={job.status} />
              <JobActionsMenu jobId={job.id} slug={job.slug} />
            </div>
            {job.stages.length > 0 && <JobPipelineBreakdown job={job} />}
          </div>
        ))}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Search className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No jobs match your filters.
            </p>
            {filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function JobPipelineBreakdown({ job }: { job: JobRow }) {
  const total = job.stages.reduce((sum, stage) => sum + stage.count, 0);
  return <div className="col-span-full min-w-0 space-y-2.5 sm:pl-12" aria-label={`${job.title} pipeline breakdown`}>
    <div className="flex h-1 max-w-5xl gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {total ? job.stages.filter(stage => stage.count > 0).map(stage => <div key={stage.id} className="min-w-1 rounded-full" style={{ flex: stage.count, backgroundColor: pipelineStageColor(stage) }} />) : <div className="w-full rounded-full bg-muted" />}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {job.stages.map(stage => <Link key={stage.id} href={`/dashboard/pipeline?jobId=${job.id}&stage=${encodeURIComponent(stage.name)}` as Route} className="inline-flex min-w-0 items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${job.title}: ${stage.name}, ${stage.count} candidates`}>
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: pipelineStageColor(stage) }} />
        <span>{stage.name}</span>
        <span className={`font-semibold tabular-nums ${stage.count > 0 ? "text-foreground" : "text-muted-foreground"}`}>{stage.count}</span>
      </Link>)}
    </div>
  </div>;
}
