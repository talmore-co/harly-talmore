import Link from "next/link";
import { clients, db } from "@harly/db";
import { and, asc, eq, isNull, isNotNull } from "drizzle-orm";
import { can, requirePermission } from "@/features/workspaces/permissions-server";
import { Button } from "@/components/ui/button";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { organization } = await requirePermission("clients:view");
  const archived = (await searchParams).archived === "true";
  const rows = await db.select().from(clients).where(and(eq(clients.workspaceId, organization.id), archived ? isNotNull(clients.archivedAt) : isNull(clients.archivedAt))).orderBy(asc(clients.name));
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Clients</h1><p className="text-sm text-muted-foreground">Internal company directory for Talmore’s recruiting team.</p></div>{await can("clients:manage") ? <Button asChild><Link href="/dashboard/clients/new">New client</Link></Button> : null}</div>
    <div className="flex gap-3"><Button asChild variant={!archived ? "default" : "outline"}><Link href="/dashboard/clients">Active</Link></Button><Button asChild variant={archived ? "default" : "outline"}><Link href="/dashboard/clients?archived=true">Archived</Link></Button></div>
    <div className="divide-y rounded-xl border">{rows.map((client) => <Link key={client.id} href={`/dashboard/clients/${client.id}`} className="block space-y-1 p-4 hover:bg-muted/40"><p className="font-medium">{client.name}</p><p className="text-sm text-muted-foreground">{client.contacts.length} contact{client.contacts.length === 1 ? "" : "s"}</p></Link>)}{!rows.length ? <p className="p-8 text-center text-muted-foreground">No {archived ? "archived " : ""}clients yet.</p> : null}</div>
  </div>;
}
