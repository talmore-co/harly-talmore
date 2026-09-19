"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/notification-island/toast";
import { updateApplicationStatus } from "@/features/pipeline/actions";
import { getAgencyApplication, recordClientOffer } from "./application-actions";

type Data = Awaited<ReturnType<typeof getAgencyApplication>>;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function AgencyApplicationPanel({ applications }: { applications: { id: string; jobTitle: string }[] }) {
  const [selectedId, setApplicationId] = useState(applications[0]?.id ?? "");
  const applicationId = applications.some((application) => application.id === selectedId) ? selectedId : applications[0]?.id ?? "";
  return <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">Client offers & hire details</h2><p className="text-sm text-muted-foreground">Internal records only. Recording an offer sends nothing and does not mark the candidate as hired.</p>
    <Select value={applicationId} onValueChange={setApplicationId}><SelectTrigger aria-label="Application for client offer or hire"><SelectValue placeholder="Select an application" /></SelectTrigger><SelectContent>{applications.map((application) => <SelectItem key={application.id} value={application.id}>{application.jobTitle}</SelectItem>)}</SelectContent></Select>
    {applicationId ? <ApplicationDetails key={applicationId} applicationId={applicationId} /> : <p className="text-sm text-muted-foreground">Add the candidate to a job first.</p>}
  </section>;
}
function ApplicationDetails({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(false);
  const [version, setVersion] = useState(0); const router = useRouter();
  useEffect(() => { let cancelled = false; getAgencyApplication(applicationId).then((result) => { if (!cancelled) { setData(result); setError(false); } }).catch(() => { if (!cancelled) setError(true); }); return () => { cancelled = true; }; }, [applicationId, version]);
  if (error) return <p role="alert">Could not load this application’s records.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading records…</p>;
  const refresh = () => { setVersion((v) => v + 1); router.refresh(); };
  return <div className="space-y-5"><p className="text-sm">Client: {data.clientName ?? "No client linked to this job"}</p>
    <HireForm key={`hire-${version}`} applicationId={applicationId} data={data} onSaved={refresh} />
    <div className="space-y-3"><h3 className="font-medium">Client-issued offers</h3>{data.offers.map((offer) => <div key={offer.id} className="rounded-lg border p-3"><p className="mb-2 text-sm font-medium">{offer.clientName}</p><ClientOfferForm applicationId={applicationId} offer={offer} disabled={!data.canManageOffers} onSaved={refresh} /></div>)}
      {data.canManageOffers && data.clientId ? <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Record client offer</summary><div className="mt-3"><ClientOfferForm key={`new-${version}`} applicationId={applicationId} onSaved={refresh} /></div></details> : !data.clientId ? <p className="text-sm text-muted-foreground">Link a client in the job editor to record client offers. Hiring does not require an offer.</p> : null}
    </div>
  </div>;
}
function HireForm({ applicationId, data, onSaved }: { applicationId: string; data: Data; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); startTransition(async () => {
    const result = await updateApplicationStatus({ applicationIds: [applicationId], workspaceId: data.workspaceId, status: "hired", hireDetails: { hiredOn: String(fields.get("hiredOn")), hireTerms: String(fields.get("hireTerms")) } });
    if (!result.success) return void toast.error(result.error);
    toast.success("Hire recorded"); onSaved();
  }); }}><h3 className="font-medium">{data.status === "hired" ? "Hired" : "Record a hire"}</h3><p className="text-xs text-muted-foreground">Hire date is when the placement was confirmed, not necessarily the first day of work. No offer is required.</p><fieldset disabled={pending || !data.canEdit} className="space-y-3"><label className="block space-y-1 text-sm">Hire date<Input className="max-w-xs" type="date" name="hiredOn" required defaultValue={data.hiredOn ?? today()} /></label><label className="block space-y-1 text-sm">Terms / start date · optional<Textarea name="hireTerms" rows={3} maxLength={10000} defaultValue={data.hireTerms ?? ""} placeholder="Record any known terms, start date or placement notes. Leave blank if unknown." /></label>{data.canEdit ? <Button type="submit">{pending ? "Saving…" : data.status === "hired" ? "Save hire details" : "Mark as hired"}</Button> : null}</fieldset></form>;
}
function ClientOfferForm({ applicationId, offer, disabled = false, onSaved }: { applicationId: string; offer?: Data["offers"][number]; disabled?: boolean; onSaved: () => void }) {
  const [status, setStatus] = useState(offer?.status ?? "pending"); const [pending, startTransition] = useTransition();
  return <form onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); startTransition(async () => {
    const result = await recordClientOffer({ id: offer?.id, applicationId, offeredOn: String(fields.get("offeredOn")), terms: String(fields.get("terms")), status: status as "pending" | "accepted" | "declined" | "withdrawn" });
    if (!result.success) return void toast.error(result.error); toast.success("Client offer recorded"); onSaved();
  }); }}><fieldset disabled={disabled || pending} className="space-y-3"><div className="flex flex-wrap gap-3"><label className="space-y-1 text-sm">Offer date<Input type="date" name="offeredOn" required defaultValue={offer?.offeredOn ?? today()} /></label><label className="space-y-1 text-sm">Decision<Select disabled={disabled || pending} value={status} onValueChange={setStatus}><SelectTrigger className="w-48" aria-label="Client offer decision"><SelectValue /></SelectTrigger><SelectContent>{["pending", "accepted", "declined", "withdrawn"].map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></label></div><label className="block space-y-1 text-sm">Known terms · optional<Textarea name="terms" maxLength={10000} defaultValue={offer?.terms ?? ""} placeholder="Salary, start date and other terms, if known" /></label>{!disabled ? <Button type="submit" variant="outline">{pending ? "Saving…" : offer ? "Save client offer" : "Record client offer"}</Button> : null}</fieldset></form>;
}
