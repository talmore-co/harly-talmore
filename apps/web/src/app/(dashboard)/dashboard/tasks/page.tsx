import {
  listTaskContextOptions,
  listTasks,
  listWorkspaceMembers,
} from "@/features/tasks/data";
import { TasksView } from "@/features/tasks/TasksView";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const context = await requirePagePermission("tasks:read");
  const [tasks, members, contextOptions] = await Promise.all([
    listTasks(),
    listWorkspaceMembers(),
    listTaskContextOptions(),
  ]);

  return (
    <TasksView
      tasks={tasks}
      members={members}
      currentUserId={context.user.id}
      contextOptions={contextOptions}
    />
  );
}
