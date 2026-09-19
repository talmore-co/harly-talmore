"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/notification-island/toast";
import { linkJobClient } from "./actions";
export function JobClientSelect({ jobId, clientId, options }: { jobId: string; clientId: string | null; options: { id: string; name: string; archivedAt: Date | null }[] }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  const selectedClient = options.find((client) => client.id === clientId);
  const selectedLabel = selectedClient ? `${selectedClient.name}${selectedClient.archivedAt ? " (archived)" : ""}` : "No client / internal vacancy";
  return <div className="min-w-0 space-y-2"><p className="text-sm font-medium">Client · internal</p><Select disabled={pending} value={clientId ?? "none"} onValueChange={(value) => startTransition(async () => {
    const result = await linkJobClient(jobId, value === "none" ? null : value);
    if (!result.success) return void toast.error(result.error);
    toast.success("Client updated"); router.refresh();
  })}><SelectTrigger className="w-full min-w-0" aria-label="Client company" title={selectedLabel}><SelectValue className="min-w-0 flex-1 overflow-hidden text-left"><span className="truncate">{selectedLabel}</span></SelectValue></SelectTrigger><SelectContent><SelectItem value="none">No client / internal vacancy</SelectItem>{options.filter((client) => !client.archivedAt || client.id === clientId).map((client) => <SelectItem key={client.id} value={client.id} disabled={Boolean(client.archivedAt)}>{client.name}{client.archivedAt ? " (archived)" : ""}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Saved immediately. Never shown on public job pages.</p></div>;
}
