"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useRangeSelection } from "@/components/ui/use-range-selection";
import { ImportSearchSelect } from "@/features/candidates/import/ImportSearchSelect";
import { browseRecruitCrmResources, previewRecruitCrm, queueRecruitCrmImport, recentRecruitCrmImports, recruitCrmOptions, fetchMoreRecruitCrm, queueAllRecruitCrm, recruitCrmProgress, retryRecruitCrmFailures } from "./actions";

type Preview = Extract<Awaited<ReturnType<typeof previewRecruitCrm>>, { ok: true }>;
export function RecruitCrmImportPanel({ jobs }: { jobs: { id: string; title: string }[] }) {
  const [destination, setDestination] = useState("pool"); const [job, setJob] = useState(""); const [stage, setStage] = useState("");
  const [connection, setConnection] = useState(""); const [kind, setKind] = useState<"search" | "job">("search"); const [sourceJob, setSourceJob] = useState("");
  const [field, setField] = useState<"first_name" | "last_name" | "email" | "linkedin" | "position" | "city" | "country">("first_name");
  const [query, setQuery] = useState(""); const [owner, setOwner] = useState("all"); const [notes, setNotes] = useState(false); const [cv, setCv] = useState(true);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof recruitCrmOptions>>>({ connections: [], stages: [] });
  const [sourceJobs, setSourceJobs] = useState<{ id: string; name: string }[]>([]); const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [jobPage, setJobPage] = useState(1); const [moreJobs, setMoreJobs] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null); const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof recruitCrmProgress>> | null>(null);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentRecruitCrmImports>>>([]); const [error, setError] = useState(""); const [pending, start] = useTransition();
  const selectable = preview?.rows.filter(row => ["ready", "failed", "partial"].includes(row.status)).map(row => row.id) || [];
  const toggle = useRangeSelection(selectable, setSelected);
  useEffect(() => { let active = true; recruitCrmOptions(job || undefined).then(value => { if (active) { setOptions(value); setStage(value.stages[0]?.id || ""); } }).catch(() => { if (active) setError("Could not load import options."); }); return () => { active = false; }; }, [job]);
  useEffect(() => { let active = true; recentRecruitCrmImports().then(value => { if (active) setRecent(value); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!preview || !(preview.rows.some(row => ["queued", "processing"].includes(row.status)) || (progress && ((progress.counts.queued || 0) + (progress.counts.processing || 0) > 0 || ["queued", "processing"].includes(progress.discoveryStatus))))) return;
    let active = true;
    const timer = setInterval(() => { recruitCrmProgress(preview.batchId).then(value => { if (active) { setProgress(value); setPreview(current => current?.batchId === preview.batchId ? { ...current, rows: value.rows, hasMore: value.hasMore } : current); } }).catch(() => { if (active) setError("Could not refresh import progress. Retry from recent imports."); }); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [preview, progress]);
  const run = (action: () => Promise<void>) => start(async () => { setError(""); try { await action(); } catch { setError("The request was interrupted. Please retry."); } });
  function picker(label: string, value: string, change: (id: string) => void, rows: { id: string; name: string }[]) { return <ImportSearchSelect label={label} value={value} onChange={id => { change(id); setPreview(null); setProgress(null); }} options={rows} disabled={pending} preserveOrder={label === "Pipeline stage"} />; }
  function browseResources(id: string, page = 1) { run(async () => {
    const result = await browseRecruitCrmResources(id, "jobs", page);
    if (!result.ok) { setError(result.error); return; }
    setSourceJobs(current => page === 1 ? result.rows : [...new Map([...current, ...result.rows].map(row => [row.id, row])).values()]); setJobPage(page); setMoreJobs(result.hasMore);
    if (page === 1) { const users = await browseRecruitCrmResources(id, "users"); if (users.ok) setOwners(users.rows); else setError(users.error); }
  }); }
  async function refresh(batchId: string) { const value = await recruitCrmProgress(batchId); setProgress(value); setPreview({ ok: true, batchId, rows: value.rows, hasMore: value.hasMore }); }
  function load() { run(async () => {
    const result = await previewRecruitCrm({ connectionId: connection, jobId: destination === "job" ? job : null, stageId: destination === "job" ? stage : null, sourceKind: kind, sourceJob, field, query, ownerId: owner === "all" ? undefined : owner, includeNotes: notes, includeCv: cv });
    if (!result.ok) { setError(result.error); return; } setPreview(result); setProgress(null); setSelected(new Set(result.rows.filter(row => row.status === "ready").map(row => row.id))); setRecent(await recentRecruitCrmImports());
  }); }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Import runs in the background. Existing profiles and pipeline stages are preserved. Imports do not send messages or run application-created automations.</p>
    {picker("Destination", destination, setDestination, [{ id: "pool", name: "Talent pool" }, { id: "job", name: "Job pipeline" }])}
    {destination === "job" && <>{picker("Talmore job", job, setJob, jobs.map(row => ({ id: row.id, name: row.title })))}{picker("Pipeline stage", stage, setStage, options.stages)}</>}
    {picker("Recruit CRM account", connection, id => { setConnection(id); setSourceJob(""); setOwner("all"); setSourceJobs([]); setOwners([]); browseResources(id); }, options.connections)}
    {!options.connections.length && <Link className="text-sm underline" href="/settings/integrations/recruitcrm">Connect Recruit CRM in Settings</Link>}
    {picker("Browse candidates", kind, id => setKind(id as typeof kind), [{ id: "search", name: "Search candidates" }, { id: "job", name: "Candidates from a Recruit CRM job" }])}
    {kind === "job" ? <>{picker("Recruit CRM job", sourceJob, setSourceJob, sourceJobs)}{moreJobs && <Button variant="outline" disabled={pending} onClick={() => browseResources(connection, jobPage + 1)}>Load more jobs</Button>}</> : <>
      {picker("Search by", field, id => setField(id as typeof field), [{ id: "first_name", name: "First name" }, { id: "last_name", name: "Last name" }, { id: "email", name: "Email" }, { id: "linkedin", name: "LinkedIn URL" }, { id: "position", name: "Job title" }, { id: "city", name: "City" }, { id: "country", name: "Country" }])}
      <div className="space-y-2"><Label htmlFor="crm-query">Search Recruit CRM</Label><Input id="crm-query" value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setPreview(null); }} placeholder="Leave blank to browse all candidates" /></div>
      {picker("Recruiter owner", owner, setOwner, [{ id: "all", name: "All owners" }, ...owners])}
    </>}
    <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><Checkbox checked={cv} disabled={pending} onCheckedChange={checked => { setCv(checked === true); setPreview(null); }} />Copy CV</label><label className="flex items-center gap-2"><Checkbox checked={notes} disabled={pending} onCheckedChange={checked => { setNotes(checked === true); setPreview(null); }} />Import recruiter notes</label></div>
    <Button variant="outline" disabled={pending || !connection || (kind === "job" && !sourceJob) || (destination === "job" && (!job || !stage))} onClick={() => load()}>{pending ? "Loading…" : "Preview candidates"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {preview && <div className="space-y-3">
      {progress && <div role="status" className="space-y-1 text-sm"><p>Saved destination: {progress.destinationLabel}</p><p className="text-muted-foreground">{progress.sourceLabel}</p><p className="font-medium">{progress.counts.imported || 0} imported · {progress.counts.skipped || 0} skipped · {(progress.counts.failed || 0) + (progress.counts.partial || 0) + (progress.counts.expired || 0)} failed · {(progress.counts.queued || 0) + (progress.counts.processing || 0)} in progress</p>
        {progress.importAll && <p>{["queued", "processing"].includes(progress.discoveryStatus) ? `Fetching more matching candidates. ${progress.total} found so far.` : progress.discoveryStatus === "failed" ? "Fetching paused. Already queued candidates can continue importing." : `All source pages fetched. ${progress.total} candidates found.`}</p>}
        {progress.discoveryError && <p className="text-muted-foreground">{progress.discoveryError}</p>}
      </div>}
      <div className="flex flex-wrap gap-2">
        {!progress?.importAll && <>
          <Button disabled={pending || !selected.size} onClick={() => run(async () => { const result = await queueRecruitCrmImport(preview.batchId, [...selected]); if (result.ok) { await refresh(preview.batchId); setSelected(new Set()); } else setError(result.error); })}>Import {selected.size} selected</Button>
          {preview.hasMore && <Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await fetchMoreRecruitCrm(preview.batchId); if (!result.ok) { setError(result.error); return; } const previous = new Set(preview.rows.map(row => row.id)); setSelected(current => new Set([...current, ...result.rows.filter(row => row.status === "ready" && !previous.has(row.id)).map(row => row.id)])); setPreview(result); })}>Fetch more</Button>}
          <Button variant="outline" disabled={pending || (!preview.rows.length && !preview.hasMore)} onClick={() => run(async () => { const result = await queueAllRecruitCrm(preview.batchId); if (!result.ok) { setError(result.error); return; } setSelected(new Set()); await refresh(preview.batchId); })}>Import all matching candidates</Button>
        </>}
        {progress?.importAll && progress.discoveryStatus === "failed" && <Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await queueAllRecruitCrm(preview.batchId); if (!result.ok) setError(result.error); else await refresh(preview.batchId); })}>Retry fetching</Button>}
        {progress && ((progress.counts.failed || 0) + (progress.counts.partial || 0) > 0) && <Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await retryRecruitCrmFailures(preview.batchId); if (!result.ok) setError(result.error); else await refresh(preview.batchId); })}>Retry failed candidates</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{progress?.importAll ? "You can close the browser. Fetching and importing continue in the background." : "Import all matching includes every candidate matching these filters, including pages you have not loaded, regardless of checkbox selection."}</p>
      {progress?.importAll && progress.total > preview.rows.length && <p className="text-xs text-muted-foreground">Showing the first {preview.rows.length} candidates. Progress counts include the full import.</p>}
      {!progress?.importAll && <Button variant="outline" size="sm" disabled={pending || !selectable.length} onClick={() => setSelected(selected.size ? new Set() : new Set(selectable))}>{selected.size ? "Deselect all" : "Select all loaded"}</Button>}
      {!preview.rows.length && <p className="text-sm">No candidates found.</p>}
      {preview.rows.map(row => <label key={row.id} className="flex gap-3 rounded-lg border p-3 text-sm"><Checkbox aria-label={`Import ${row.name}`} checked={selected.has(row.id)} disabled={pending || !selectable.includes(row.id)} onClick={event => { event.preventDefault(); toggle(row.id, event.shiftKey); }} onCheckedChange={value => toggle(row.id, false, value === true)} /><span className="min-w-0"><span className="block font-medium">{row.name}</span><span className="block text-muted-foreground">{row.email || "No email"}{row.headline ? ` · ${row.headline}` : ""}</span><span className="block text-xs">{row.hasCv ? "CV available" : "No CV"}{row.optedOut ? " · Email opted out" : ""}{row.offLimits ? " · Off limits" : ""}</span><span className="block">{row.status}{row.reason ? ` · ${row.reason}` : ""}</span></span></label>)}
      <p className="text-xs text-muted-foreground">You can close this drawer while imports run. Reopen a recent import to check progress or retry failures.</p>
    </div>}
    {recent.length > 0 && <ImportSearchSelect label="Recent imports" value={preview?.batchId || ""} options={recent.map(row => ({ id: row.id, name: `${new Date(row.createdAt).toLocaleString()} · ${row.id.slice(0, 8)}` }))} preserveOrder onChange={id => run(async () => { setSelected(new Set()); await refresh(id); })} />}
  </div>;
}
