import { notFound } from "next/navigation";
import { requireAutomationAccess } from "@/features/automations/access";
import { getWorkflow, serializeWorkflow } from "@/features/automations/data";
import { getBuilderData } from "@/features/automations/builder-data";
import { WorkflowBuilder } from "@/features/automations/builder/WorkflowBuilder";

export const dynamic = "force-dynamic";

export default async function WorkflowBuilderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { organization } = await requireAutomationAccess();
  const { id } = await params;
  const isNew = id === "new";
  const workflow = isNew ? null : await getWorkflow({ workspaceId: organization.id, id }).catch(() => null);
  if (!isNew && !workflow) notFound();
  return <WorkflowBuilder initial={workflow ? serializeWorkflow(workflow) : null} builderData={await getBuilderData()} isNew={isNew} />;
}
