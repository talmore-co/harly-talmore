"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import type { Trigger, WorkflowEvent } from "../schema";
import { Inbox, Sparkles, Bell, MailQuestion, ArrowRightLeft, UserCheck, UserX, UserPlus, UserRoundPen, CalendarPlus, CalendarCheck, BriefcaseBusiness } from "lucide-react";
import { TRIGGER_CATALOG, triggerMeta } from "./catalog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The WHEN panel: pick the trigger event from a visual grid, and optionally add
 * a trigger.filter (key=value equality, AND-ed) to narrow which emissions fire.
 * The filter is a cheap pre-check the dispatcher runs before creating a run.
 */
export function TriggerPanel({
  value,
  onChange,
  jobs = [],
}: {
  value: Trigger;
  onChange: (t: Trigger) => void;
  jobs?: { id: string; title: string }[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const meta = triggerMeta(value.event);

  const filterEntries = Object.entries(value.filter ?? {});

  function setFilterEntry(key: string, val: string) {
    const next = { ...value.filter };
    if (val === "") delete next[key];
    else next[key] = val;
    onChange({ ...value, filter: Object.keys(next).length ? next : undefined });
  }

  return (
    <div className="space-y-4">
      {/* Current event — click to swap */}
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
          pickerOpen ? "border-foreground/20 bg-row-wash" : "border-mist-border bg-paper-raised hover:bg-row-wash/60",
        )}
      >
        <span className="flex items-center gap-3">
          <ToneIcon event={value.event} active />
          <span>
            <span className="block text-sm font-medium text-foreground">{meta.label}</span>
            <span className="block text-xs text-ink-soft">{meta.blurb}</span>
          </span>
        </span>
        <span className="text-xs font-medium text-ink-soft">{pickerOpen ? "Done" : "Change"}</span>
      </button>

      {pickerOpen && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRIGGER_CATALOG.map(({ event }) => {
            const m = triggerMeta(event);
            const active = value.event === event;
            return (
              <button
                key={event}
                type="button"
                onClick={() => {
                  onChange({ event, filter: value.filter, ...(event === "booking.followup_due" ? { offsetHours: 24 } : {}) });
                  setPickerOpen(false);
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-foreground/25 bg-row-wash"
                    : "border-mist-border bg-paper-raised hover:border-foreground/15 hover:bg-row-wash/50",
                )}
              >
                <ToneIcon event={event} active={active} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{m.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{m.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Label>Job</Label>
        <Select value={String(value.filter?.jobId ?? "all")} onValueChange={(id) => setFilterEntry("jobId", id === "all" ? "" : id)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All open jobs</SelectItem>{jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {value.event === "booking.followup_due" && <div className="space-y-2">
        <Label htmlFor="workflow-offset">Hours after the invitation email is sent</Label>
        <OffsetHoursInput key={`${value.event}:${value.offsetHours ?? 24}`} value={value.offsetHours ?? 24} onCommit={(offsetHours) => onChange({ ...value, offsetHours })} />
        <p className="text-xs text-muted-foreground">Runs once per matching booking invitation. Create another workflow for an additional follow-up.</p>
      </div>}
      {value.event === "application.created" && <p className="text-xs text-muted-foreground">Questionnaire scores are available on application. For AI score conditions, choose “AI evaluation completed” so the result is ready.</p>}
      {/* Trigger filter */}
      <div className="rounded-xl border border-mist-border bg-kraft/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Run only when</span>
          <button
            type="button"
             onClick={() => onChange({ ...value, filter: { ...value.filter, [`field${filterEntries.length}`]: "" } })}
            className="text-xs font-medium text-foreground hover:underline"
          >
            + add filter
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          Narrow the trigger to emissions where these payload fields match. Leave empty to run on every event.
        </p>
        <div className="mt-3 space-y-2">
          {filterEntries.length === 0 && (
            <p className="text-xs italic text-ink-soft/70">No filter — runs on every matching event.</p>
          )}
          {filterEntries.map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                value={key}
                onChange={(e) => {
                  const v = String(val);
                  // Re-key: remove old, add new.
                  const next = { ...value.filter };
                  delete next[key];
                  next[e.target.value] = v;
                  onChange({ ...value, filter: next });
                }}
                placeholder="field"
                className="h-9 w-[40%] rounded-md border border-mist-border bg-paper-raised px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              />
              <span className="text-xs text-ink-soft">=</span>
              <input
                value={String(val)}
                onChange={(e) => setFilterEntry(key, e.target.value)}
                placeholder="value"
                className="h-9 flex-1 rounded-md border border-mist-border bg-paper-raised px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              />
              <button
                type="button"
                onClick={() => setFilterEntry(key, "")}
                className="text-xs text-ink-soft hover:text-rust"
                aria-label={`Remove filter ${key}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Neutral icon tile for a trigger category — chrome stays quiet, glyph carries the meaning. */
function ToneIcon({
  event,
  active,
}: {
  event: WorkflowEvent;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
        active ? "bg-paper-raised text-foreground shadow-soft" : "bg-kraft text-ink-soft",
      )}
    >
      <TriggerGlyph event={event} />
    </span>
  );
}

function OffsetHoursInput({ value, onCommit }: { value: number; onCommit: (hours: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return <Input id="workflow-offset" type="number" min={0.25} max={720} step={0.25} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => {
    const parsed = draft.trim() ? Number(draft) : NaN;
    const hours = Number.isFinite(parsed) ? Math.min(720, Math.max(0.25, parsed)) : value;
    setDraft(String(hours));
    onCommit(hours);
  }} />;
}

function TriggerGlyph({ event }: { event: WorkflowEvent }) {
  const icons = { "application.created": Inbox, "application.evaluated": Sparkles, "interview.reminder_due": Bell, "booking.followup_due": MailQuestion, "application.stage_changed": ArrowRightLeft, "application.hired": UserCheck, "application.rejected": UserX, "candidate.created": UserPlus, "candidate.updated": UserRoundPen, "interview.scheduled": CalendarPlus, "interview.completed": CalendarCheck, "job.published": BriefcaseBusiness };
  const Icon = icons[event];
  return <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />;
}
