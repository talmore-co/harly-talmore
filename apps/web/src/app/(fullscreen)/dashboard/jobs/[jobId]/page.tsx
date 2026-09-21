import { notFound } from "next/navigation";
import { can } from "@/features/workspaces/permissions-server";
import { listClientOptions } from "@/features/clients/actions";
import { JobClientSelect } from "@/features/clients/JobClientSelect";
import { RoleTakenOn } from "@/features/jobs/RoleTakenOn";
import { JobScorecardEditor } from "@/features/jobs/JobScorecardEditor";
import { ExternalLink } from "lucide-react";

import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { updateJobAction } from "@/features/jobs/actions";
import {
  getDashboardJob,
  listWorkspaceDepartments,
} from "@/features/jobs/data";
import { getCareerPageData } from "@/features/career-page/data";
import {
  listJobHiringTeam,
  listWorkspaceMembers,
} from "@/features/jobs/hiring-team-data";
import { JobForm } from "@/features/jobs/JobForm";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { JobShareButton } from "@/features/jobs/JobShareButton";
import { JobStatusActions } from "@/features/jobs/JobStatusActions";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { countCandidatePool } from "@/features/matching/data";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

type DashboardJobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function DashboardJobPage({
  params,
}: DashboardJobPageProps) {
  const { jobId } = await params;
  const { organization: workspace } = await getWorkspaceContext();
  const [result, departments, hiringTeam, workspaceMembers, aiStatus, candidatePoolCount, careerPageData] =
    await Promise.all([
      getDashboardJob(jobId),
      listWorkspaceDepartments(),
      listJobHiringTeam(jobId),
      listWorkspaceMembers(),
      getWorkspaceAiStatus(workspace.id),
      countCandidatePool(workspace.id),
      getCareerPageData(workspace.slug),
    ]);

  if (!result) {
    notFound();
  }

  const { job } = result;
  const clientOptions = await can("clients:view") && await can("clients:manage") ? await listClientOptions() : null;
  const appUrl = getHarlyPublicOrigin();
  const publicUrl = `${appUrl}/jobs/${job.slug}`;

  return (
    <JobForm
      action={updateJobAction}
      job={job}
      submitLabel="Save changes"
      departments={departments}
      hiringTeam={hiringTeam}
      workspaceMembers={workspaceMembers}
      aiConfigured={aiStatus.enabled && aiStatus.hasApiKey}
      candidatePoolCount={candidatePoolCount}
      eyebrow="Job detail"
      statusBadge={<JobStatusBadge status={job.status} />}
      previewWorkspace={careerPageData?.workspace ?? null}
      previewConfig={careerPageData?.config ?? null}
      detailsExtras={<>
        {clientOptions ? <JobClientSelect jobId={job.id} clientId={job.clientId} options={clientOptions} /> : null}
        <RoleTakenOn key={`${job.id}:${job.takenOn}`} jobId={job.id} takenOn={job.takenOn} today={new Date().toISOString().slice(0, 10)} canEdit={await can("jobs:edit")} />
      </>}
      scorecardSection={<JobScorecardEditor key={JSON.stringify(job.scorecardDefinition)} jobId={job.id} definition={job.scorecardDefinition} canEdit={await can("jobs:edit")} />}
      headerActions={
        <JobActionsMenu key="job-actions" jobId={job.id} slug={job.slug} redirectAfterTrash />
      }
      railActions={
        <>
          <Button asChild variant="outline" size="sm" className="w-full justify-start">
            <a href={`/jobs/${job.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              View job
            </a>
          </Button>
          <JobShareButton
            url={publicUrl}
            title={job.title}
            workspaceSlug={workspace.slug}
            slug={job.slug}
          />
          <JobStatusActions job={job} />
        </>
      }
    />
  );
}
