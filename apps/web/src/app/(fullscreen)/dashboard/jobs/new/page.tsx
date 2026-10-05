import { createJobAction } from "@/features/jobs/actions";
import { listWorkspaceDepartments } from "@/features/jobs/data";
import { getCareerPageData } from "@/features/career-page/data";
import { JobForm } from "@/features/jobs/JobForm";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { can } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const { organization: workspace } = await getWorkspaceContext();
  const [departments, careerPageData, canPublish] = await Promise.all([
    listWorkspaceDepartments(),
    getCareerPageData(workspace.slug),
    can("jobs:publish"),
  ]);

  return (
    <JobForm
      action={createJobAction}
      // Without jobs:publish the action keeps the new job as a draft, so the
      // primary button must not promise a publish.
      submitLabel={canPublish ? "Publish" : "Create draft"}
      departments={departments}
      previewWorkspace={careerPageData?.workspace ?? null}
      previewConfig={careerPageData?.config ?? null}
    />
  );
}
