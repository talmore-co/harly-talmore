"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notification-island/toast";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { EditTaskDialog } from "./EditTaskDialog";
import { updateTask } from "./actions";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskItem,
} from "./shared";
import { RelativeDate } from "./task-ui";

const emptyOptions = {
  candidates: [],
  applications: [],
  jobs: [],
  interviews: [],
};

export function ApplicationTasks({
  applications,
  tasks,
  members,
  candidateId,
  candidateName,
  currentUserId,
  canWrite,
}: {
  applications: { id: string; jobId: string; jobTitle: string }[];
  tasks: TaskItem[];
  members: { id: string; name: string; image: string | null }[];
  candidateId: string;
  candidateName: string;
  currentUserId: string;
  canWrite: boolean;
}) {
  const params = useSearchParams();
  const requested = params.get("applicationId");
  const application =
    applications.find((item) => item.id === requested) ?? applications[0];
  if (!application)
    return (
      <p className="text-sm text-muted-foreground">
        Add this candidate to a job to create application tasks.
      </p>
    );
  return (
    <div id="application-tasks" className="scroll-mt-24 rounded-lg border border-border/60 bg-background/92 p-4 shadow-sm shadow-black/[0.02]">
      <ApplicationTaskList
        key={application.id}
        application={application}
        tasks={tasks.filter((task) => task.applicationId === application.id)}
        members={members}
        candidateId={candidateId}
        candidateName={candidateName}
        currentUserId={currentUserId}
        canWrite={canWrite}
      />
    </div>
  );
}

function ApplicationTaskList({
  application,
  tasks,
  members,
  candidateId,
  candidateName,
  currentUserId,
  canWrite,
}: Omit<Parameters<typeof ApplicationTasks>[0], "applications"> & {
  application: { id: string; jobId: string; jobTitle: string };
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const refresh = () => router.refresh();
  const open = tasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress",
  );
  const history = tasks.filter(
    (task) => task.status === "completed" || task.status === "canceled",
  );
  const contextLabel = `${candidateName} · ${application.jobTitle}`;
  const row = (task: TaskItem) => (
    <li
      key={task.id}
      className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words text-sm font-medium">{task.title}</p>
        {task.description ? (
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{task.ownerName}</span>
          <span>{TASK_PRIORITY_LABELS[task.priority]}</span>
          <span>{TASK_STATUS_LABELS[task.status]}</span>
          <RelativeDate iso={task.dueDate} />
        </div>
      </div>
      {canWrite ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setEditing(task)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await updateTask({
                    taskId: task.id,
                    status:
                      task.status === "completed" || task.status === "canceled"
                        ? "pending"
                        : "completed",
                  });
                  if (!result.success)
                    toast.error(result.error ?? "Could not update task.");
                  else refresh();
                } catch {
                  toast.error("Could not update task.");
                }
              })
            }
          >
            {task.status === "completed" || task.status === "canceled"
              ? "Reopen"
              : "Complete"}
          </Button>
        </div>
      ) : null}
    </li>
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Open tasks · {open.length}</h2>
        {canWrite ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            Create task
          </Button>
        ) : null}
      </div>
      {open.length ? (
        <ul className="space-y-2">{open.map(row)}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No open tasks for this application.
        </p>
      )}
      {history.length ? (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Completed & canceled · {history.length}
          </summary>
          <ul className="mt-3 space-y-2">{history.map(row)}</ul>
        </details>
      ) : null}
      {creating ? (
        <CreateTaskDialog
          open
          onOpenChange={setCreating}
          members={members}
          contextOptions={emptyOptions}
          defaultOwnerId={currentUserId}
          defaultLinks={{
            candidateId,
            applicationId: application.id,
            jobId: application.jobId,
            interviewId: null,
          }}
          contextLabel={contextLabel}
          onSaved={refresh}
        />
      ) : null}
      {editing ? (
        <EditTaskDialog
          key={editing.id}
          open
          onOpenChange={(value) => {
            if (!value) setEditing(null);
          }}
          task={editing}
          members={members}
          contextOptions={emptyOptions}
          contextLabel={contextLabel}
          onSave={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
