import { notFound } from "next/navigation";

import { getEmailTemplate } from "@/features/email-templates/data";
import { TemplateEditorPage } from "@/features/email-templates/TemplateEditorPage";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { TEMPLATE_STARTERS } from "@/features/email-templates/starters";

export const dynamic = "force-dynamic";

export default async function TemplateEditorRoute({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ starter?: string | string[] }> }) {
  const [{ templateId }, workspace] = await Promise.all([params, requirePagePermission("templates:manage")]);
  const template = templateId === "new" ? null : await getEmailTemplate(templateId);
  if (templateId !== "new" && !template) notFound();
  const query = await searchParams;
  const starter = templateId === "new" ? TEMPLATE_STARTERS.find(item => item.type === query.starter) : undefined;
  return <TemplateEditorPage key={template?.id ?? starter?.type ?? "blank"} template={template} starter={starter} workspaceName={workspace.organization.name} />;
}
