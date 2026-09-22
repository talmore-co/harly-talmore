"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRangeSelection } from "@/components/ui/use-range-selection";
import { ImportSearchSelect } from "@/features/candidates/import/ImportSearchSelect";
import { talentSourcerImportOptions, previewTalentSourcerImport, submitTalentSourcerImport } from "./actions";

type Options = Extract<Awaited<ReturnType<typeof talentSourcerImportOptions>>, { ok: true }>;
type Preview = Extract<Awaited<ReturnType<typeof previewTalentSourcerImport>>, { ok: true }>;

export function TalentSourcerImportPanel({ jobId }: { jobId: string }) {
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [kind, setKind] = useState<"shortlist" | "interested">("shortlist");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [options, setOptions] = useState<Options | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const selectableIds = preview?.rows.filter(row => ["ready", "failed"].includes(row.status)).map(row => row.id) || [];
  const toggleSelection = useRangeSelection(selectableIds, setSelected);
  useEffect(() => {
    let active = true;
    talentSourcerImportOptions(jobId, project || undefined, organization || undefined).then(result => {
      if (!active) return;
      if (result.ok) { setOptions(result); setStage(current => result.stages.some(row => row.id === current) ? current : result.stages[0]?.id || ""); setError(""); }
      else setError(result.error);
    }).catch(() => { if (active) setError("Could not load TalentSourcer. Please try again."); });
    return () => { active = false; };
   }, [jobId, project, organization, attempt]);
  function load(cursor?: string) {
    startTransition(async () => {
      setError("");
      try {
        const result = await previewTalentSourcerImport({ organizationId: organization, jobId, stageId: stage, projectId: project, sourceId: source, kind, cursor });
        if (result.ok) { setPreview(result); setSelected(new Set(result.rows.filter(row => row.status === "ready").map(row => row.id))); }
        else setError(result.error);
      } catch { setError("Could not load the preview. Try again."); }
    });
  }
  const picker = (label: string, value: string, change: (value: string) => void, rows: Array<{ id: string; name?: string; title?: string }>) => <ImportSearchSelect label={label} value={value} disabled={pending} preserveOrder={label === "Pipeline stage"} onChange={value => { change(value); setPreview(null); }} options={rows.map(row => ({ id: row.id, name: row.name || row.title || row.id }))} />;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Review up to 50 candidates per page. Imports add candidates silently; they do not send messages or run application-created automations. Candidates without email can be imported.</p>
    {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry connection</Button> <Link className="underline" href="/settings/integrations/talentsourcer">Connection settings</Link></div>}
    {!options && !error && <p role="status">Loading TalentSourcer…</p>}
    {options && <>
      {picker("Pipeline stage", stage, setStage, options.stages)}
      {options.connections.length ? picker("TalentSourcer workspace", organization, value => { setOrganization(value); setProject(""); setSource(""); setSelected(new Set()); setOptions(current => current ? { ...current, projects: [], shortlists: [], campaigns: [] } : null); }, options.connections.map(row => ({ ...row, name: `${row.name} · ${row.id}` }))) : <p className="text-sm">No connected workspaces. <Link className="underline" href="/settings/integrations/talentsourcer">Connect TalentSourcer</Link></p>}
      {organization && picker("Project", project, value => { setProject(value); setSource(""); setOptions(current => current ? { ...current, shortlists: [], campaigns: [] } : null); }, options.projects)}
      {organization && picker("Candidate source", kind, value => { setKind(value as typeof kind); setSource(""); }, [{ id: "shortlist", name: "Shortlist" }, { id: "interested", name: "Interested campaign candidates" }])}
      {project && picker(kind === "shortlist" ? "Shortlist" : "Campaign", source, setSource, kind === "shortlist" ? options.shortlists : options.campaigns)}
      <Button variant="outline" disabled={pending || !organization || !source || !stage} onClick={() => load()}>{pending ? "Working…" : "Load preview"}</Button>
    </>}
    {preview && <>
      <Button variant="outline" size="sm" disabled={pending || !selectableIds.length} onClick={() => setSelected(selected.size ? new Set() : new Set(selectableIds))}>{selected.size ? "Deselect all" : "Select all on this page"}</Button>
      <div className="space-y-2">{preview.rows.length === 0 && <p className="text-sm">No matching candidates on this page.</p>}{preview.rows.map(row => <label key={row.id} className="flex items-start gap-3 rounded-lg border p-3"><Checkbox aria-label={`Import ${row.name}`} checked={selected.has(row.id)} disabled={pending || !["ready", "failed"].includes(row.status)} onClick={event => { event.preventDefault(); toggleSelection(row.id, event.shiftKey); }} onCheckedChange={checked => toggleSelection(row.id, false, checked === true)} /><span className="min-w-0 text-sm"><span className="block font-medium">{row.name}</span><span className="block text-muted-foreground">{row.email || "No email"}{row.headline ? ` · ${row.headline}` : ""}</span><span className="block">{row.status === "imported" ? "Imported" : row.reason || "Ready to import"}</span></span></label>)}</div>
      <div className="flex flex-wrap gap-2"><Button disabled={pending || !selected.size} onClick={() => startTransition(async () => {
        try { const result = await submitTalentSourcerImport({ batchId: preview.batchId, itemIds: [...selected] }); if (result.ok) { setPreview({ ...preview, rows: result.rows }); setSelected(new Set(result.rows.filter(row => row.status === "failed").map(row => row.id))); setError(""); } else setError(result.error); }
        catch { setError("The import response was interrupted. Retry this selection; successful imports will not be duplicated."); }
      })}>{pending ? "Importing…" : `Import ${selected.size} selected`}</Button>{!preview.isDone && <Button variant="outline" disabled={pending} onClick={() => load(preview.continueCursor)}>Next page</Button>}</div>
      <p className="text-xs text-muted-foreground">Existing profiles and pipeline stages are preserved. Preview expires after 30 minutes.</p>
    </>}
  </div>;
}
