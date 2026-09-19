import Link from "next/link";
import { getAgencyReports } from "@/features/reports/agency-data";
import {
  reportFilters,
  type ReportParams,
} from "@/features/reports/agency-metrics";
import { ReportsDashboard } from "@/features/reports/ReportsDashboard";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportParams>;
}) {
  await requirePagePermission("reports:read");
  const params = await searchParams;
  try {
    reportFilters(params);
  } catch (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Reports</h1>
        <p role="alert">
          {error instanceof Error ? error.message : "Invalid report filters."}
        </p>
        <Link className="underline" href="/dashboard/reports">
          Reset filters
        </Link>
      </div>
    );
  }
  return (
    <ReportsDashboard
      key={JSON.stringify(params)}
      data={await getAgencyReports(params)}
    />
  );
}
