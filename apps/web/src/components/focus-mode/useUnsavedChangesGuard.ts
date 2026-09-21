"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Guards a full-screen editor against losing unsaved work. Binds `beforeunload`
 * so tab-close / reload / browser-back prompt the browser's own native warning
 * (its text is browser-controlled and can't be restyled), and returns a
 * `confirmDiscard` helper plus dialog state for in-app exits (the router push
 * you control) so those can use Talmore's own styled confirm dialog instead of
 * `window.confirm`.
 *
 * Reusable by any focus-mode builder (career page, automations, job editor, …).
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const allowNextUnloadRef = useRef(false);
  useEffect(() => {
    allowNextUnloadRef.current = false;
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // The in-app dialog has already authorized this navigation. Set and
      // consume this synchronously: a hard navigation can run before React
      // commits the dialog close or a dirty-state update.
      if (allowNextUnloadRef.current) {
        allowNextUnloadRef.current = false;
        return;
      }
      // Modern spec: calling preventDefault triggers the native prompt.
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  /**
   * Returns a promise that resolves true when it's safe to proceed with an
   * in-app navigation. When dirty, opens the styled confirm dialog and
   * resolves with the user's choice.
   */
  const confirmDiscard = useCallback(() => {
    if (!dirty) {
      allowNextUnloadRef.current = true;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialogOpen(true);
    });
  }, [dirty]);

  const resolveDialog = useCallback((value: boolean) => {
    // AlertDialog can also call onCancel as it closes after confirmation.
    // Only the first choice should resolve or change the navigation permit.
    if (!resolveRef.current) return;
    if (value) allowNextUnloadRef.current = true;
    setDialogOpen(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  return {
    confirmDiscard,
    discardDialogProps: {
      open: dialogOpen,
      onConfirm: () => resolveDialog(true),
      onCancel: () => resolveDialog(false),
    },
  };
}
