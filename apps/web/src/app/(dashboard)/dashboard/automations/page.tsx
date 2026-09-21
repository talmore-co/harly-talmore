import { requireAutomationAccess } from "@/features/automations/access";
import { listWorkflows, serializeWorkflow } from "@/features/automations/data";
import { AutomationsManager } from "@/features/automations/AutomationsManager";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const { organization } = await requireAutomationAccess();
  return <AutomationsManager initialWorkflows={(await listWorkflows(organization.id)).map(serializeWorkflow)} />;
}
