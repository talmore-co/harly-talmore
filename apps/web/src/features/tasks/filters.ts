import { TASK_PRIORITIES, TASK_STATUSES, taskDueState, type TaskItem } from "./shared";

/** Assignee filter: the signed-in user, everyone, or one member's id. */
export const ASSIGNEE_ME = "me";
/** Status filter: "open" covers to-do and in-progress, the page default. */
export const STATUS_OPEN = "open";
export const FILTER_ANY = "all";

export const TASK_DUE_FILTERS = ["due", "overdue", "no_due"] as const;

export type TaskFilters = {
  query: string;
  assignee: string;
  priority: string;
  status: string;
  due: string;
};

/** Matches the sidebar badge: my tasks that are still open. */
export const DEFAULT_TASK_FILTERS: TaskFilters = {
  query: "",
  assignee: ASSIGNEE_ME,
  priority: FILTER_ANY,
  status: STATUS_OPEN,
  due: FILTER_ANY,
};

function oneOf(value: string | null, allowed: readonly string[], fallback: string) {
  return value && allowed.includes(value) ? value : fallback;
}

/** Read filters from URL params, ignoring values this workspace cannot match. */
export function parseTaskFilters(
  params: { get(key: string): string | null },
  memberIds: string[],
): TaskFilters {
  return {
    query: params.get("q") ?? "",
    assignee: oneOf(
      params.get("assignee"),
      [FILTER_ANY, ...memberIds],
      ASSIGNEE_ME,
    ),
    priority: oneOf(params.get("priority"), TASK_PRIORITIES, FILTER_ANY),
    status: oneOf(
      params.get("status"),
      [FILTER_ANY, ...TASK_STATUSES],
      STATUS_OPEN,
    ),
    due: oneOf(params.get("due"), TASK_DUE_FILTERS, FILTER_ANY),
  };
}

export function matchesAssignee(
  task: Pick<TaskItem, "ownerId">,
  assignee: string,
  currentUserId: string,
) {
  if (assignee === FILTER_ANY) return true;
  return task.ownerId === (assignee === ASSIGNEE_ME ? currentUserId : assignee);
}

function matchesStatus(task: Pick<TaskItem, "status">, status: string) {
  if (status === FILTER_ANY) return true;
  if (status === STATUS_OPEN)
    return task.status === "pending" || task.status === "in_progress";
  return task.status === status;
}

export function filterTasks(
  tasks: TaskItem[],
  filters: TaskFilters,
  currentUserId: string,
): TaskItem[] {
  const q = filters.query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (!matchesAssignee(task, filters.assignee, currentUserId)) return false;
    if (filters.priority !== FILTER_ANY && task.priority !== filters.priority)
      return false;
    if (!matchesStatus(task, filters.status)) return false;
    const dueState = taskDueState(task.dueDate);
    if (filters.due === "due" && !dueState) return false;
    if (filters.due === "overdue" && dueState !== "overdue") return false;
    if (filters.due === "no_due" && task.dueDate) return false;
    if (!q) return true;
    return [task.title, task.candidateName, task.jobTitle, task.ownerName]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q));
  });
}
