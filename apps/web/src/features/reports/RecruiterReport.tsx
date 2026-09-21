"use client";
import Link from "next/link";
import type { Route } from "next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecruiterReportRow } from "./recruiter-data";

export function RecruiterReport({ rows }: { rows: RecruiterReportRow[] }) {
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border p-5">
        <div>
          <h2 className="font-semibold">
            Recruiter activity and follow-through
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Selected period and accessible jobs. Assigned jobs and overdue tasks
            show the current state. Interview counts use the interview date;
            assessments and task completions use their recorded dates.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Recruiter",
                "Assigned jobs",
                "Interviews completed",
                "Assessments submitted",
                "Tasks completed",
                "First submissions recorded",
                "First hires recorded",
                "Overdue tasks",
                "Missing assessments",
              ].map((label) => (
                <TableHead key={label} className="min-w-28 whitespace-normal">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="min-w-40 font-medium">
                  {row.name}
                </TableCell>
                {[
                  row.jobs,
                  row.interviews,
                  row.assessments,
                  row.tasksCompleted,
                  row.submissions,
                  row.placements,
                  row.overdueTasks,
                  row.missingAssessments.length,
                ].map((value, index) => (
                  <TableCell key={index} className="tabular-nums">
                    {value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No assigned recruiters or recorded activity for these filters.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Interviews belong to the assigned interviewer, assessments to their
          author and tasks to their current owner. Submissions and hires count
          the first recorded stage entry per application under the member who
          recorded it. Automation may act under its creator. These are recorded
          actions, not sole credit for a placement or a conversion funnel.
          Shared job assignments are counted for each teammate.
        </p>
      </section>
      <section className="space-y-4 rounded-2xl border p-5">
        <div>
          <h2 className="font-semibold">
            Completed interviews missing an assessment
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Completed interviews in the selected period without an
            interview-linked assessment by the assigned interviewer. Open the
            application to review the record.
          </p>
        </div>
        {rows.some((row) => row.missingAssessments.length) ? (
          <ul className="divide-y">
            {rows.flatMap((row) =>
              row.missingAssessments.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span>
                    {row.name} · {item.name}
                  </span>
                  <Link
                    className="underline underline-offset-4"
                    href={
                      `/dashboard/candidates/${item.candidateId}?tab=interviews&applicationId=${item.applicationId}` as Route
                    }
                  >
                    Review interview
                  </Link>
                </li>
              )),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No missing assessments found for these filters.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Completeness checks identify records to review. They do not verify the
          accuracy of interview notes or recommendations.
        </p>
      </section>
    </div>
  );
}
