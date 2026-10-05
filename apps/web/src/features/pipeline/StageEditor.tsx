"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DotsSixVerticalIcon,
  LockSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons/phosphor";
import { Input } from "@/components/ui/input";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import {
  createJobStage,
  deleteJobStage,
  renameJobStage,
  reorderJobStages,
} from "@/features/pipeline/stage-actions";
import {
  STAGE_NAME_MAX_LENGTH,
  isOutcomeStage,
  validateNewStageName,
  validateStageOrder,
  validateStageRename,
} from "@/features/pipeline/stage-rules";
import { statusForStageName } from "@/features/pipeline/state";
import { cn } from "@/lib/utils";

type EditorStage = { id: string; name: string };

type StageEditorProps = {
  jobId: string;
  jobTitle: string;
  /** Ordered as on the board. */
  stages: EditorStage[];
  /** Applications currently in each stage, by stage id. */
  applicationCounts: Record<string, number>;
  /** "primary" for the empty state, where adding stages is the next step. */
  emphasis?: "quiet" | "primary";
};

type ActionResult = { success: boolean; error?: string };

/**
 * Stage management for one job: add, rename, reorder, delete.
 *
 * "Hired", "Rejected" and "Rejected by client" are locked. Application status,
 * offers, placements and reports recognise those stages by name, so renaming or
 * deleting one would silently change what a move means. The server enforces the
 * same rules (`stage-rules.ts`); the checks here only make the feedback instant.
 */
export function StageEditor({
  jobId,
  jobTitle,
  stages,
  applicationCounts,
  emphasis = "quiet",
}: StageEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(stages);
  const [syncedStages, setSyncedStages] = useState(stages);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditorStage | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Follow the server's stages, but never mid-save: the optimistic order wins
  // until the action settles.
  if (!pending && syncedStages !== stages) {
    setSyncedStages(stages);
    setItems(stages);
  }

  async function run(action: () => Promise<ActionResult>) {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Unable to update stages.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Unable to update stages.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function clearDraft(stageId: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[stageId];
      return next;
    });
  }

  async function commitRename(stage: EditorStage) {
    const draft = drafts[stage.id];
    if (draft === undefined || pending) return;
    const checked = validateStageRename(stage, draft, items);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (checked.value === stage.name) {
      clearDraft(stage.id);
      return;
    }

    const previous = items;
    setItems(
      items.map((item) =>
        item.id === stage.id ? { ...item, name: checked.value } : item,
      ),
    );
    clearDraft(stage.id);
    const saved = await run(() =>
      renameJobStage({ jobId, stageId: stage.id, name: checked.value }),
    );
    if (!saved) setItems(previous);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || pending) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(items, from, to);
    const checked = validateStageOrder(
      items,
      next.map((item) => item.id),
    );
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    const previous = items;
    setItems(next);
    const saved = await run(() =>
      reorderJobStages({ jobId, orderedStageIds: checked.value }),
    );
    if (!saved) setItems(previous);
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const checked = validateNewStageName(newName, items);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const saved = await run(() => createJobStage({ jobId, name: checked.value }));
    if (saved) setNewName("");
  }

  async function handleDelete(stage: EditorStage) {
    setDeleteTarget(null);
    const previous = items;
    setItems(items.filter((item) => item.id !== stage.id));
    const saved = await run(() => deleteJobStage({ jobId, stageId: stage.id }));
    if (!saved) setItems(previous);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setDrafts({});
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant={emphasis === "primary" ? "default" : "outline"}
          size={emphasis === "primary" ? "default" : "sm"}
        >
          {emphasis === "primary" ? "Add pipeline stages" : "Manage stages"}
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title="Pipeline stages"
        description={`Stages for ${jobTitle}. Changes apply to this job only.`}
      >
        <div className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {items.length === 0 ? (
            <p className="rounded-[var(--radius-md)] bg-warm-paper p-4 text-[13px] text-soft-ink">
              No stages yet. Add the first one below. New applications land in
              the first stage.
            </p>
          ) : (
            <DndContext
              id={`stage-editor-${jobId}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="space-y-1.5">
                  {items.map((stage, index) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      first={index === 0}
                      count={applicationCounts[stage.id] ?? 0}
                      value={drafts[stage.id] ?? stage.name}
                      disabled={pending}
                      onChange={(value) =>
                        setDrafts((current) => ({ ...current, [stage.id]: value }))
                      }
                      onCommit={() => void commitRename(stage)}
                      onDelete={() => setDeleteTarget(stage)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}

          <form onSubmit={(event) => void handleAdd(event)} className="flex gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New stage name"
              aria-label="New stage name"
              maxLength={STAGE_NAME_MAX_LENGTH}
              disabled={pending}
            />
            <Button type="submit" disabled={pending || !newName.trim()}>
              <PlusIcon className="size-4" />
              Add stage
            </Button>
          </form>

          <ul className="space-y-1.5 text-[13px] leading-relaxed text-soft-ink">
            <li>New applications land in the first stage.</li>
            <li>
              Hired, Rejected and Rejected by client set the outcome of an
              application, so they cannot be renamed or deleted.
            </li>
            <li>
              Automations, scorecards and saved links refer to stages by name.
              Renaming a stage does not update them.
            </li>
            <li>
              A stage can be deleted once no candidate is in it or has passed
              through it.
            </li>
          </ul>
        </div>

        {/* Inside the drawer so focus and dismissal nest under the sheet. */}
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete the &quot;{deleteTarget?.name}&quot; stage?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The stage is removed from this job, along with document
                requirements tied to it. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteTarget) void handleDelete(deleteTarget);
                }}
              >
                Delete stage
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DrawerLayout>
    </Sheet>
  );
}

function StageRow({
  stage,
  first,
  count,
  value,
  disabled,
  onChange,
  onCommit,
  onDelete,
}: {
  stage: EditorStage;
  first: boolean;
  count: number;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id, disabled });
  const locked = isOutcomeStage(stage.name);
  const outcome = statusForStageName(stage.name);
  const hint = locked
    ? outcome === "hired"
      ? "Marks candidates as hired"
      : "Marks candidates as rejected"
    : first
      ? "New applications land here"
      : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-md)] border border-hairline bg-pure-snow px-2 py-2",
        isDragging && "relative z-10 shadow-[var(--shadow-float)]",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="shrink-0 touch-none cursor-grab rounded-md p-1.5 text-quiet-mist transition-colors hover:text-near-ink focus-visible:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink active:cursor-grabbing disabled:opacity-50"
        aria-label={`Reorder ${stage.name}`}
      >
        <DotsSixVerticalIcon className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        {locked ? (
          <p className="flex h-9 items-center gap-1.5 px-1 text-[14px] font-medium text-near-ink">
            <span className="truncate">{stage.name}</span>
            <LockSimpleIcon className="size-3.5 shrink-0 text-quiet-mist" aria-hidden />
            <span className="sr-only">Locked</span>
          </p>
        ) : (
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label={`Name of the ${stage.name} stage`}
            maxLength={STAGE_NAME_MAX_LENGTH}
            disabled={disabled}
            className="h-9"
          />
        )}
        {hint ? (
          <p className="mt-0.5 px-1 text-[12px] text-soft-ink">{hint}</p>
        ) : null}
      </div>

      <span
        className="font-chrome tabular shrink-0 text-[12px] text-soft-ink"
        aria-label={`${count} ${count === 1 ? "candidate" : "candidates"} in ${stage.name}`}
      >
        {count}
      </span>

      {locked ? (
        <span className="size-8 shrink-0" aria-hidden />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || count > 0}
          onClick={onDelete}
          aria-label={
            count > 0
              ? `${stage.name} cannot be deleted while candidates are in it`
              : `Delete ${stage.name}`
          }
          title={
            count > 0 ? "Move its candidates to another stage first" : undefined
          }
          className="shrink-0 text-soft-ink hover:text-destructive"
        >
          <TrashIcon className="size-4" />
        </Button>
      )}
    </li>
  );
}
