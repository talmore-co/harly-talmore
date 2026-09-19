"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export function PipelineClientFilter({ clients }: { clients: { id: string; name: string }[] }) {
  const params = useSearchParams(); const router = useRouter();
  return <Select value={params.get("clientId") ?? "all"} onValueChange={(value) => {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("clientId"); else next.set("clientId", value);
    next.set("jobId", "all"); next.set("view", "list"); next.delete("job"); next.delete("scope");
    router.push(`/dashboard/pipeline?${next}` as Route);
  }}><SelectTrigger className="w-full sm:w-56" aria-label="Filter by client"><SelectValue placeholder="All clients" /></SelectTrigger><SelectContent><SelectItem value="all">All clients</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select>;
}
