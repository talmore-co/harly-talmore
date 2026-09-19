import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { clients, db } from "@harly/db";
import { z } from "zod";
import {
  can,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { ClientEditor } from "@/features/clients/ClientEditor";
import { listJobsWithStats } from "@/features/jobs/data";
import { JobsTable } from "@/features/jobs/JobsTable";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();
  const context = await requirePermission("clients:view");
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, context.organization.id),
        eq(clients.id, clientId),
      ),
    );
  if (!client) notFound();
  const canManage = await can("clients:manage"),
    canViewJobs = await can("jobs:view");
  const jobs = canViewJobs ? await listJobsWithStats(client.id) : [];
  return (
    <div className="space-y-6">
      <Link href="/dashboard/clients" className="text-sm underline">
        Clients
      </Link>
      <h1 className="text-xl font-semibold">
        {client.name}
        {client.archivedAt ? " · Archived" : ""}
      </h1>
      <p className="text-sm text-muted-foreground">
        Client information is internal. Public vacancies use Talmore branding.
      </p>
      {canViewJobs ? (
        <Link
          className="inline-block text-sm underline"
          href={`/dashboard/pipeline?jobId=all&clientId=${client.id}`}
        >
          View active applications for this client
        </Link>
      ) : null}
      <ClientEditor
        client={{ ...client, archived: Boolean(client.archivedAt) }}
        canManage={canManage}
      />
      {canViewJobs ? (
        <section className="space-y-4 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Jobs</h2>
              <p className="text-sm text-muted-foreground">
                Only jobs linked to {client.name}. Open jobs are active; draft
                and closed jobs are inactive.
              </p>
            </div>
            <Link
              className="text-sm underline"
              href={`/dashboard/jobs?clientId=${client.id}`}
            >
              View in Jobs
            </Link>
          </div>
          {jobs.length ? (
            <JobsTable jobs={jobs} showClient={false} />
          ) : (
            <p className="rounded-xl border p-6 text-sm text-muted-foreground">
              No jobs are linked to this client that you can access.
            </p>
          )}
          {canManage ? (
            <p className="text-xs text-muted-foreground">
              To link a job, select this client in the job editor.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
