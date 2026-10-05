"use client";

import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type ConfirmActionCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
};

/**
 * The one confirmation for candidate decisions that are hard to take back
 * (delete, hire). Replaces native confirm() so the wording, focus handling and
 * styling are the same on the list and on the profile.
 */
export function ConfirmActionDialog({
  copy,
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  pendingLabel,
  trigger,
}: {
  /** Null while nothing is waiting for confirmation. */
  copy: ConfirmActionCopy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  pendingLabel?: string;
  /** Optional element that opens the dialog; omit when opened from state. */
  trigger?: ReactNode;
}) {
  return (
    <AlertDialog open={open && copy !== null} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={copy?.variant ?? "default"}
            disabled={pending}
            onClick={(event) => {
              // The caller closes the dialog once its action has settled.
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending && pendingLabel ? pendingLabel : copy?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Deleting from the list or the profile erases the candidate right away; it
 * does not park them in the trash. The copy has to say so.
 */
export function deleteCandidatesCopy(
  target: { name: string } | { count: number },
): ConfirmActionCopy {
  const single = "name" in target || target.count === 1;
  const subject =
    "name" in target
      ? target.name
      : `${target.count} candidate${target.count === 1 ? "" : "s"}`;
  return {
    title: `Delete ${subject} permanently?`,
    description: `${single ? "Their profile" : "Their profiles"}, applications, notes, files and messages are erased. This can't be undone.`,
    confirmLabel: "Delete permanently",
    variant: "destructive",
  };
}

export function hireCandidatesCopy(
  target: { name: string; jobTitle: string | null } | { count: number },
): ConfirmActionCopy {
  if ("name" in target) {
    return {
      title: `Mark ${target.name} as hired?`,
      description: target.jobTitle
        ? `This sets their application for ${target.jobTitle} to hired.`
        : "This sets their latest application to hired.",
      confirmLabel: "Mark hired",
    };
  }
  const noun = target.count === 1 ? "application" : "applications";
  return {
    title: `Mark ${target.count} ${noun} as hired?`,
    description:
      target.count === 1
        ? "This sets the selected candidate's latest application to hired."
        : "This sets the latest application of every selected candidate to hired.",
    confirmLabel: "Mark hired",
  };
}
