"use client";

import { useEffect, useRef, useState } from "react";

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
import { hireConfirmationCopy } from "@/features/pipeline/confirmation";

/**
 * Hiring is a decision, so it is confirmed every time, including for a single
 * candidate. Resolves true to proceed and false when cancelled or dismissed.
 */
export function useHireConfirmation() {
  const [count, setCount] = useState<number | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  useEffect(() => () => { resolver.current?.(false); }, []);

  function finish(confirmed: boolean) {
    resolver.current?.(confirmed);
    resolver.current = null;
    setCount(null);
  }

  function confirmHire(applicationCount: number): Promise<boolean> {
    if (resolver.current) return Promise.resolve(false);
    setCount(applicationCount);
    return new Promise((resolve) => { resolver.current = resolve; });
  }

  const copy = hireConfirmationCopy(count ?? 1);
  const hireDialog = (
    <AlertDialog open={count !== null} onOpenChange={(open) => { if (!open) finish(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="default" onClick={() => finish(true)}>
            {copy.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmHire, hireDialog };
}
