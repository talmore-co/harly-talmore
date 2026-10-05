import { describe, expect, it } from "vitest";

import {
  DEFAULT_TASK_FILTERS,
  filterTasks,
  parseTaskFilters,
} from "./filters";
import type { TaskItem } from "./shared";

function task(overrides: Partial<TaskItem>): TaskItem {
  return {
    id: "task",
    title: "Call candidate",
    description: null,
    status: "pending",
    priority: "medium",
    dueDate: null,
    completedAt: null,
    ownerId: "me",
    ownerName: "Me",
    ownerImage: null,
    ownerUsername: null,
    candidateId: null,
    candidateName: null,
    applicationId: null,
    jobId: null,
    jobTitle: null,
    interviewId: null,
    createdById: "me",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const tasks = [
  task({ id: "mine-open", ownerId: "user-1" }),
  task({ id: "mine-progress", ownerId: "user-1", status: "in_progress" }),
  task({ id: "mine-done", ownerId: "user-1", status: "completed" }),
  task({ id: "mine-canceled", ownerId: "user-1", status: "canceled" }),
  task({ id: "theirs-open", ownerId: "user-2", priority: "urgent" }),
];

const ids = (filters = DEFAULT_TASK_FILTERS) =>
  filterTasks(tasks, filters, "user-1").map((item) => item.id);

describe("task filters", () => {
  it("defaults to my open tasks, like the sidebar badge", () => {
    expect(ids()).toEqual(["mine-open", "mine-progress"]);
  });

  it("keeps completed tasks reachable through the status filter", () => {
    expect(ids({ ...DEFAULT_TASK_FILTERS, status: "completed" })).toEqual([
      "mine-done",
    ]);
    expect(ids({ ...DEFAULT_TASK_FILTERS, status: "all" })).toHaveLength(4);
  });

  it("filters by another assignee or everyone", () => {
    expect(ids({ ...DEFAULT_TASK_FILTERS, assignee: "user-2" })).toEqual([
      "theirs-open",
    ]);
    expect(ids({ ...DEFAULT_TASK_FILTERS, assignee: "all" })).toEqual([
      "mine-open",
      "mine-progress",
      "theirs-open",
    ]);
  });

  it("reads filters from URL params and ignores unknown values", () => {
    const params = new URLSearchParams(
      "assignee=user-2&status=completed&priority=urgent&due=overdue&q=call",
    );
    expect(parseTaskFilters(params, ["user-1", "user-2"])).toEqual({
      query: "call",
      assignee: "user-2",
      priority: "urgent",
      status: "completed",
      due: "overdue",
    });
    expect(
      parseTaskFilters(
        new URLSearchParams("assignee=gone&status=nope&priority=x&due=y"),
        ["user-1"],
      ),
    ).toEqual(DEFAULT_TASK_FILTERS);
  });
});
