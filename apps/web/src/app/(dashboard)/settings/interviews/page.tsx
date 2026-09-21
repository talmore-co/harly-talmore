import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { InterviewReminderSettings } from "@/features/interviews/InterviewReminderSettings";
import { DEFAULT_INTERVIEW_REMINDER } from "@/features/interviews/reminder-settings";
import { getInterviewReminderSettings } from "@/features/interviews/reminders";

export const dynamic = "force-dynamic";

export default async function InterviewSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization } = await getWorkspaceContext();
  const config = await getInterviewReminderSettings(organization.id);
  return (
    <InterviewReminderSettings
      initial={config?.settings ?? DEFAULT_INTERVIEW_REMINDER}
    />
  );
}
