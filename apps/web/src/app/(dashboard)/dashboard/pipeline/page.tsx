import { Suspense } from "react";
import {
  can,
  requirePagePermission,
} from "@/features/workspaces/permissions-server";
import { listClientOptions } from "@/features/clients/actions";
import { PipelineClientFilter } from "@/features/clients/PipelineClientFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import { PipelineBoard } from "@/features/pipeline/PipelineBoard";
import { RateRemainingApplications } from "@/features/pipeline/RateRemainingApplications";
import { PipelineJobSelect } from "@/features/pipeline/PipelineJobSelect";
import { PipelineList } from "@/features/pipeline/PipelineList";
import { PipelineSummaryCard } from "@/features/pipeline/PipelineSummaryCard";
import { PipelineViewToggle } from "@/features/pipeline/PipelineViewToggle";
import { StageEditor } from "@/features/pipeline/StageEditor";
import { getPipelineData } from "@/features/pipeline/data";
import { listJobClientNames } from "@/features/jobs/data";
import { getWorkspaceAiStatus } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

type PipelinePageProps = {
  searchParams: Promise<{
    job?: string;
    jobId?: string;
    view?: string;
    scope?: string;
    stage?: string;
    clientId?: string;
  }>;
};

export default async function PipelinePage({
  searchParams,
}: PipelinePageProps) {
  const { job, jobId, view: rawView, scope, stage, clientId } = await searchParams;
  const selectedId = scope === "team" ? "all" : jobId ?? job;
  const allJobs = selectedId === "all";
  const view = rawView === "board" && !allJobs ? "board" : "list";
  const { organization: workspace } =
    await requirePagePermission("candidates:view");
  const [data, aiStatus] = await Promise.all([
    getPipelineData(selectedId, clientId),
    getWorkspaceAiStatus(workspace.id),
  ]);

  if (data.kind === "empty") {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No jobs yet"
          description="Create a job to start building your pipeline."
          action={{ href: "/dashboard/jobs/new", label: "Create job" }}
        />
      </div>
    );
  }

  const canViewClients = await can("clients:view");
  const [clientOptions, jobClientNames] = canViewClients
    ? await Promise.all([listClientOptions(), listJobClientNames()])
    : [[], {}];
  const hasStages = data.stages.length > 0;
  // Stage editing is job editing; the actions re-check access for this job.
  const canManageStages = !allJobs && (await can("jobs:edit"));
  const applicationCounts: Record<string, number> = {};
  for (const application of data.applications) {
    applicationCounts[application.currentStageId] =
      (applicationCounts[application.currentStageId] ?? 0) + 1;
  }
  const stageEditor = (emphasis: "quiet" | "primary") =>
    canManageStages ? (
      <StageEditor
        key={`stages-${data.selectedJob.id}`}
        jobId={data.selectedJob.id}
        jobTitle={data.selectedJob.title}
        stages={data.stages}
        applicationCounts={applicationCounts}
        emphasis={emphasis}
      />
    ) : null;
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Suspense>
        <PipelineJobSelect
          jobs={data.jobs}
          selectedJobId={data.selectedJob.id}
          clientNames={jobClientNames}
        />
      </Suspense>
      {allJobs && clientOptions.length ? <Suspense><PipelineClientFilter clients={clientOptions} /></Suspense> : null}
      {hasStages && !allJobs ? (
        <div className="flex flex-wrap items-center gap-2">
          {stageEditor("quiet")}
          <PipelineViewToggle jobId={data.selectedJob.id} view={view} stage={stage} />
        </div>
      ) : null}
    </div>
  );

  if (!hasStages && !allJobs) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="No stages configured"
          description="Add pipeline stages to this job to start tracking candidates."
        >
          {stageEditor("primary")}
        </EmptyState>
      </div>
    );
  }

  if (data.applications.length === 0 && !stage && !allJobs) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="No candidates yet"
          description="Candidates will appear here once they apply."
        />
      </div>
    );
  }

  const evaluationAction = allJobs ? undefined : (
    <RateRemainingApplications
      key={`evaluate-${data.selectedJob.id}`}
      jobId={data.selectedJob.id}
      applications={data.applications}
      aiConfigured={
        aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady
      }
    />
  );
  return (
    <div className="space-y-4">
      {toolbar}
      {allJobs ? <p className="text-xs text-muted-foreground">Active applications across all open jobs</p> : null}
      {!allJobs ? <Suspense fallback={null}>
        <PipelineSummaryCard jobId={data.selectedJob.id} />
      </Suspense> : null}
      {view === "list" ? (
        <PipelineList
          evaluationAction={evaluationAction}
          key={`list-${data.selectedJob.id}`}
          allJobs={allJobs}
          stages={data.stages}
          applications={data.applications}
        />
      ) : (
        <PipelineBoard
          evaluationAction={evaluationAction}
          // Keyed by job only: the board keeps its filters, selection and
          // scroll across refreshes and reconciles its columns from props.
          key={`board-${data.selectedJob.id}`}
          jobs={data.jobs}
          selectedJob={data.selectedJob}
          stages={data.stages}
          applications={data.applications}
        />
      )}
    </div>
  );
}
