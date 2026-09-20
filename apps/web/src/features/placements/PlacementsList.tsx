"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { PageTitle } from "@/components/dashboard/PageTitleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";
import type { PlacementRow } from "./data";

export function PlacementsList({ placements }: { placements: PlacementRow[] }) {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState(FILTER_ALL);
  const [job, setJob] = useState(FILTER_ALL);
  const [status, setStatus] = useState(FILTER_ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const clientOptions = [
    ...new Map(
      placements.map((row) => [
        row.clientId ?? "none",
        row.clientName ?? "No client assigned",
      ]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const jobOptions = [
    ...new Map(placements.map((row) => [row.jobId, row.jobTitle])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const statuses: Record<string, string> = {
    hired: "Hired",
    active: "Active again",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  };
  const filtered = placements.filter(
    (row) =>
      (client === FILTER_ALL || (row.clientId ?? "none") === client) &&
      (job === FILTER_ALL || row.jobId === job) &&
      (status === FILTER_ALL || row.status === status) &&
      (!from || Boolean(row.hiredOn && row.hiredOn >= from)) &&
      (!to || Boolean(row.hiredOn && row.hiredOn <= to)) &&
      [row.candidateName, row.jobTitle, row.clientName, row.terms]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const activeFilters =
    Boolean(query || from || to) ||
    [client, job, status].some((value) => value !== FILTER_ALL);
  return (
    <div className="min-w-0 space-y-5">
      <PageTitle title="Placements" />
      <div>
        <h1 className="text-xl font-semibold">Placements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirmed hires across your accessible jobs. Open an application to
          review or update its placement.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search placements"
          placeholder="Search candidates, jobs, clients or terms…"
          className="w-full sm:w-80"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <FilterPill
          label="Client"
          value={client}
          onChange={setClient}
          options={clientOptions.map(([id]) => id)}
          labelMap={Object.fromEntries(clientOptions)}
        />
        <FilterPill
          label="Job"
          value={job}
          onChange={setJob}
          options={jobOptions.map(([id]) => id)}
          labelMap={Object.fromEntries(jobOptions)}
        />
        <FilterPill
          label="Application status"
          value={status}
          onChange={setStatus}
          options={Object.keys(statuses)}
          labelMap={statuses}
        />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span className="text-xs text-muted-foreground">Hire date</span>
          <DatePicker
            aria-label="Hire date from"
            value={from}
            onChange={setFrom}
            max={to || undefined}
            className="w-40"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <DatePicker
            aria-label="Hire date to"
            value={to}
            onChange={setTo}
            min={from || undefined}
            className="w-40"
          />
        </div>
        {activeFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              setClient(FILTER_ALL);
              setJob(FILTER_ALL);
              setStatus(FILTER_ALL);
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {placements.length} placements · Newest hire dates
        first
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
            <tr>
              {[
                "Candidate",
                "Client",
                "Job",
                "Hire date",
                "Application status",
                "Terms",
                "",
              ].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap px-4 py-3 font-medium"
                >
                  {label || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  <Link
                    className="hover:underline"
                    href={
                      `/dashboard/candidates/${row.candidateId}?applicationId=${row.id}&tab=offers` as Route
                    }
                  >
                    {row.candidateName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {row.clientName ?? "No client assigned"}
                </td>
                <td className="px-4 py-3">{row.jobTitle}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {row.hiredOn ?? "Not recorded"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">
                    {statuses[row.status] ?? row.status}
                  </Badge>
                </td>
                <td
                  className="max-w-xs truncate px-4 py-3"
                  title={row.terms ?? undefined}
                >
                  {row.terms || "—"}
                </td>
                <td className="px-4 py-3">
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      href={
                        `/dashboard/candidates/${row.candidateId}?applicationId=${row.id}&tab=offers` as Route
                      }
                    >
                      View
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {activeFilters
                    ? "No placements match your filters."
                    : "No placements recorded yet. Create a placement from an application’s Offers & hire tab."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Hire date means placement confirmation, not employment start. Historical
        placements remain listed after an application is reopened. Clients
        reflect the current job assignment.
      </p>
    </div>
  );
}
