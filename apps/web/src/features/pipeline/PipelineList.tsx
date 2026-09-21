"use client";
import { useRejectionConfirmation } from "@/features/candidates/useRejectionConfirmation";
import { AttributionControls, matchesAttribution } from "./AttributionControls";
import { PipelineScores, PipelineScoreControls, matchesScoreFilters, compareScores, type ScoreSort } from "./PipelineScores";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  ArrowRightLeft,
  CheckCircle2,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  bulkMoveApplications,
  updateApplicationStatus,
} from "@/features/pipeline/actions";
import { bulkDecisionConfirmationMessage } from "@/features/pipeline/confirmation";
import type {
  PipelineApplication,
  PipelineStage,
} from "@/features/pipeline/data";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ShortDateTime } from "@/lib/date-hydration";
import { MetaAttributionBadge } from "./MetaAttributionBadge";
import { cn } from "@/lib/utils";
import { useRangeSelection } from "@/components/ui/use-range-selection";
import { BulkBookingInvitationDrawer } from "@/features/interviews/BulkBookingInvitationDrawer";

type PipelineListProps = {
  allJobs?: boolean;
  evaluationAction?: React.ReactNode;
  stages: PipelineStage[];
  applications: PipelineApplication[];
};

const ALL = "__all__";

export function PipelineList({
  evaluationAction,
  stages,
  applications,
  allJobs = false,
}: PipelineListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam = searchParams.get("stage");
  const activeStage = stageParam ? (allJobs ? stageParam : stages.find((stage) => stage.name === stageParam)?.id ?? stageParam) : ALL;
  function setActiveStage(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("queue");
    if (id === ALL) next.delete("stage");
    else next.set("stage", allJobs ? id : stages.find((stage) => stage.id === id)?.name ?? id);
    setSelected(new Set());
    router.push(`/dashboard/pipeline?${next}` as Route, { scroll: false });
  }
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ScoreSort>("newest");
  const [minimumQuestionnaire, setMinimumQuestionnaire] = useState("");
  const [minimumAi, setMinimumAi] = useState("");
  const [attributionQuery, setAttributionQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const workspaceId = applications[0]?.workspaceId ?? "";
  const stageNameById = useMemo(
    () => new Map(stages.map((s) => [s.id, s.name])),
    [stages],
  );
  const orderedStageNames = useMemo(
    () => stages.slice().sort((a, b) => a.order - b.order).map((s) => s.name),
    [stages],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of applications) {
      const key = allJobs ? stageNameById.get(a.currentStageId) ?? "Unknown stage" : a.currentStageId;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [applications, allJobs, stageNameById]);
  const stageTabs = allJobs ? Array.from(new Set(stages.map((stage) => stage.name))).map((name, order) => ({ id: name, name, order })) : stages;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter((a) => {
      if (activeStage !== ALL && (allJobs ? stageNameById.get(a.currentStageId) : a.currentStageId) !== activeStage) return false;
      if (!matchesScoreFilters(a, minimumQuestionnaire, minimumAi)) return false;
      if (!matchesAttribution(a.attribution, attributionQuery)) return false;
      if (!q) return true;
      const name = `${a.candidateFirstName} ${a.candidateLastName}`.toLowerCase();
      return (
        name.includes(q) ||
        a.candidateEmail.toLowerCase().includes(q) ||
        (a.source ?? "").toLowerCase().includes(q)
      );
    }).sort((a, b) => compareScores(a, b, sort));
  }, [applications, activeStage, query, sort, minimumQuestionnaire, minimumAi, attributionQuery, allJobs, stageNameById]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((a) => next.delete(a.id));
      else filtered.forEach((a) => next.add(a.id));
      return next;
    });
  }

  const toggleOne = useRangeSelection(filtered.map((row) => row.id), setSelected);

  const selectedIds = useMemo(
    () => filtered.filter((a) => selected.has(a.id)).map((a) => a.id),
    [filtered, selected],
  );
  const selectedJobIds = new Set(applications.filter((a) => selectedIds.includes(a.id)).map((a) => a.jobId));
  const moveStages = allJobs ? stages.filter((stage) => selectedJobIds.size === 1 && selectedJobIds.has(stage.jobId ?? "")) : stages;

  function afterBulk(result: { success: boolean; error?: string; warning?: string }, label: string) {
    if (result.success) {
      if (result.warning) toast.warning(result.warning);
      toast.success(`${label} ${selectedIds.length} candidate${selectedIds.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not update candidates.");
    }
  }

  function moveToStage(toStageId: string) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const result = await bulkMoveApplications({
        applicationIds: selectedIds,
        toStageId,
        workspaceId,
      });
      afterBulk(result, "Moved");
    });
  }

  const { confirmRejection, rejectionDialog } = useRejectionConfirmation();

  async function setStatus(status: "hired" | "rejected" | "active") {
    if (selectedIds.length === 0) return;
    const sendRejectionEmail = status === "rejected" ? await confirmRejection(selectedIds.length) : false;
    if (sendRejectionEmail === null) return;
    if (
      status === "hired" &&
      selectedIds.length > 1 &&
      !window.confirm(bulkDecisionConfirmationMessage(status, selectedIds.length))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await updateApplicationStatus({
        applicationIds: selectedIds,
        workspaceId,
        status,
        sendRejectionEmail,
      });
      afterBulk(result, "Updated");
    });
  }

  return (
    <div className="space-y-4">
      {rejectionDialog}
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <PipelineScoreControls inline allowManual={false} sort={sort} onSort={setSort} questionnaire={minimumQuestionnaire} onQuestionnaire={setMinimumQuestionnaire} ai={minimumAi} onAi={setMinimumAi} />
        <AttributionControls inline query={attributionQuery} onChange={setAttributionQuery} applications={filtered} />
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground sm:ml-auto sm:max-w-xs">
          <span>Search</span>
          <span className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates…"
            aria-label="Search candidates"
            className="h-10 pl-9"
          />
          </span>
        </label>
        {evaluationAction}
      </div>

      {/* Stage tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card p-1">
        <StageTab
          label="All"
          count={applications.length}
          active={activeStage === ALL}
          onClick={() => setActiveStage(ALL)}
        />
        {stageTabs
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((stage) => (
            <StageTab
              key={stage.id}
              label={stage.name}
              count={counts.get(stage.id) ?? 0}
              active={activeStage === stage.id}
              onClick={() => setActiveStage(stage.id)}
            />
          ))}
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-accent/40 px-3 py-2 duration-200 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <BulkBookingInvitationDrawer applicationIds={selectedIds} disabled={isPending} />
               <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={isPending || moveStages.length === 0} title={allJobs && selectedJobIds.size > 1 ? "Select applications from one job to move stages" : undefined}>
                  <ArrowRightLeft className="size-4" />
                  Move to stage
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {moveStages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => (
                    <DropdownMenuItem key={stage.id} onClick={() => moveToStage(stage.id)}>
                      {stage.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("hired")}>
              <CheckCircle2 className="size-4 text-primary" />
              Hire
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("rejected")}>
              <XCircle className="size-4 text-destructive" />
              Reject
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("active")}>
              <RotateCcw className="size-4" />
              Reactivate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Rows */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Candidate
          </span>
          <span className="ml-auto hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
            Stage / Scores
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {filtered.map((a) => {
            const fullName = `${a.candidateFirstName} ${a.candidateLastName}`;
            const isSelected = selected.has(a.id);
            const stageName = stageNameById.get(a.currentStageId) ?? "Unknown stage";
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${fullName} profile`}
                data-state={isSelected ? "selected" : undefined}
                onClick={() => router.push(`/dashboard/candidates/${a.candidateId}`)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/dashboard/candidates/${a.candidateId}`);
                  }
                }}
                className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 data-[state=selected]:bg-accent/40 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onClick={(event) => { event.preventDefault(); toggleOne(a.id, event.shiftKey); }}
                    aria-label={`Select ${fullName}`}
                  />
                </div>
                <Link
                  href={`/dashboard/candidates/${a.candidateId}`}
                  onClick={(event) => event.stopPropagation()}
                  className="flex min-w-0 items-center gap-3"
                >
                  <UserAvatar
                    name={fullName}
                    src={a.candidateAvatarUrl}
                    fallbackSrcs={a.candidateAvatarFallbackSrcs}
                    size="sm"
                  />
                  <div className="min-w-0">
                    {allJobs || a.clientName ? <p className="truncate text-xs text-muted-foreground">{[a.clientName, allJobs ? a.jobTitle : null].filter(Boolean).join(" · ")}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">
                        {fullName}
                      </p>
                      <ApplicationStatusBadge status={a.status} />
                    </div>
                    <p className="flex items-center text-xs text-muted-foreground">
                      <span className="truncate">
                        {a.candidateEmail}
                        {a.source ? ` · via ${a.source}` : ""}
                      </span>
                      <MetaAttributionBadge value={a.attribution} />
                    </p>
                  </div>
                </Link>
                <div className="col-start-2 min-w-0 sm:col-auto">
                  <p className="text-xs font-medium text-foreground">{stageName}</p>
                  <PipelineSpine
                    current={stageName}
                    stages={allJobs ? stages.filter((stage) => stage.jobId === a.jobId).sort((a, b) => a.order - b.order).map((stage) => stage.name) : orderedStageNames}
                    className="mt-1.5 max-w-40"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applied <ShortDateTime value={a.appliedAt} />
                  </p>
                </div>
                <div className="col-start-2 sm:col-auto sm:self-center">
                  <PipelineScores application={a} />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Search className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No candidates in this view.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
