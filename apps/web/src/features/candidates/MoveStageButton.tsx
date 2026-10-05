"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { moveApplicationStage } from "@/features/pipeline/actions";
import { withKeyLock } from "@/lib/client-mutex";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLineRightIcon } from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

export type MoveStageTarget = {
  applicationId: string;
  fromStageId: string | null;
  workspaceId: string;
  nextStage: { id: string; name: string } | null;
  /** Every non-terminal stage of the job, in pipeline order. */
  stages?: { id: string; name: string }[];
};

/**
 * Contextual primary CTA: advances an application to the next pipeline stage.
 * The label follows the pipeline ("Move to Phone Screen" → "Move to Assessment"…)
 * and disables once the candidate is in the final stage. The chevron next to
 * it opens the full stage list for moving back or skipping ahead. Shared by the
 * header action bar and the sticky bar.
 */
export function MoveStageButton({
  target,
  size = "sm",
  className,
}: {
  target: MoveStageTarget | null;
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!target) return null;

  const moveTarget = target;
  const { nextStage } = moveTarget;
  const stages = moveTarget.stages ?? [];
  const otherStages = stages.filter(
    (stage) => stage.id !== moveTarget.fromStageId,
  );

  function move(toStage: { id: string; name: string } | null) {
    if (!toStage) return;
    startTransition(async () => {
      const result = await withKeyLock(
        `application:${moveTarget.applicationId}`,
        () =>
          moveApplicationStage({
            applicationId: moveTarget.applicationId,
            fromStageId: moveTarget.fromStageId,
            toStageId: toStage.id,
            workspaceId: moveTarget.workspaceId,
          }),
      );
      if (result.success) {
        toast.success(`Moved to ${toStage.name}.`);
        (router as { refresh?: () => void }).refresh?.();
      } else {
        toast.error(result.error ?? "Could not move candidate.");
      }
    });
  }

  const advance = (
    <Button
      size={size}
      onClick={() => move(nextStage)}
      disabled={!nextStage || isPending}
      className={cn(
        "gap-1.5",
        otherStages.length > 0 && "rounded-r-none",
        className,
      )}
      title={nextStage ? `Move to ${nextStage.name}` : "Already in the final stage"}
    >
      {nextStage ? (
        <>
          <span className="truncate">
            {isPending ? "Moving…" : `Move to ${nextStage.name}`}
          </span>
          <ArrowLineRightIcon className="size-4 shrink-0" />
        </>
      ) : (
        "Final stage"
      )}
    </Button>
  );

  if (otherStages.length === 0) return advance;

  return (
    <div className="inline-flex items-center">
      {advance}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            disabled={isPending}
            className="rounded-l-none border-l border-primary-foreground/20 px-2"
            aria-label="Move to another stage"
            title="Move to another stage"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
          {stages.map((stage) => {
            const isCurrent = stage.id === moveTarget.fromStageId;
            return (
              <DropdownMenuItem
                key={stage.id}
                disabled={isCurrent}
                onSelect={() => move(stage)}
              >
                <span className="truncate">{stage.name}</span>
                {isCurrent ? (
                  <>
                    <Check className="ml-auto size-4" />
                    <span className="sr-only">Current stage</span>
                  </>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
