import { listEmailTemplates } from "@/features/email-templates/data";
import { TemplatesManager } from "@/features/email-templates/TemplatesManager";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
export const dynamic = "force-dynamic";
export default async function TemplatesSettingsPage() {
  const workspace = await requirePagePermission("templates:manage");
  return (
    <TemplatesManager
      templates={await listEmailTemplates()}
      workspaceName={workspace.organization.name}
    />
  );
}
