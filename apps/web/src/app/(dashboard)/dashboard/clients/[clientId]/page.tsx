import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { clients, jobs, db } from "@harly/db";
import { z } from "zod";
import { can, requireJobPermission, requirePermission } from "@/features/workspaces/permissions-server";
import { ClientEditor } from "@/features/clients/ClientEditor";
import { JobClientSelect } from "@/features/clients/JobClientSelect";
import { listClientOptions } from "@/features/clients/actions";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();
  const context = await requirePermission("clients:view");
  const [client] = await db.select().from(clients).where(and(eq(clients.workspaceId, context.organization.id), eq(clients.id, clientId)));
  if (!client) notFound();
  const canManage = await can("clients:manage");
  const options = canManage ? await listClientOptions() : [];
  const allJobs = await db.select({ id: jobs.id, title: jobs.title, clientId: jobs.clientId, status: jobs.status }).from(jobs).where(and(eq(jobs.workspaceId, context.organization.id), isNull(jobs.deletedAt))).orderBy(asc(jobs.title));
  const accessible = (await Promise.all(allJobs.map(async (job) => {
    const allowed = async (permission: "jobs:view" | "jobs:edit") => {
      try { await requireJobPermission(permission, job.id, context); return true; }
      catch (error) {
        if (error instanceof Error && ["You do not have permission to perform this action.", "You do not have access to this job.", "You are not assigned to this job.", "Job not found."].includes(error.message)) return false;
        throw error;
      }
    };
    if (!await allowed("jobs:view")) return null;
    return { ...job, editable: canManage && await allowed("jobs:edit") };
  }))).filter((job) => job !== null);
  return <div className="space-y-6"><Link href="/dashboard/clients" className="text-sm underline">Clients</Link><h1 className="text-xl font-semibold">{client.name}{client.archivedAt ? " · Archived" : ""}</h1><p className="text-sm text-muted-foreground">Client information is internal. Public vacancies use Talmore branding.</p>
    <Link className="inline-block text-sm underline" href={`/dashboard/pipeline?jobId=all&clientId=${client.id}`}>View active applications for this client</Link>
    <ClientEditor client={{ ...client, archived: Boolean(client.archivedAt) }} canManage={canManage} />
    <section className="max-w-3xl space-y-3"><h2 className="text-lg font-semibold">Jobs</h2>{accessible.filter((job) => job.clientId === client.id || (!job.clientId && job.editable && !client.archivedAt)).map((job) => <div key={job.id} className="space-y-3 rounded-lg border p-4"><Link className="font-medium underline" href={`/dashboard/jobs/${job.id}`}>{job.title}</Link><p className="text-sm text-muted-foreground">{job.status} · {job.clientId === client.id ? "Linked to this client" : "Not linked to a client"}</p>{job.editable ? <JobClientSelect jobId={job.id} clientId={job.clientId} options={options} /> : null}</div>)}<p className="text-xs text-muted-foreground">Link existing jobs above, or select a client from the job editor after creating a job.</p></section>
  </div>;
}
