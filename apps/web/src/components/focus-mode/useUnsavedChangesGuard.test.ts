import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));
// Exercise the unload/dialog handshake without a DOM renderer. The regression
// occurs before React commits any state update, so state setters deliberately
// do not re-render the hook here.
vi.mock("react", () => ({
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(value: T) => [value, vi.fn()],
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function unloadIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("unsaved changes navigation confirmation", () => {
  beforeEach(() => vi.stubGlobal("window", new EventTarget()));
  afterEach(() => {
    effects.cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
  });

  it("allows the confirmed navigation before a React update, without a second prompt", async () => {
    const guard = useUnsavedChangesGuard(true);
    expect(unloadIsBlocked()).toBe(true);
    const choice = guard.confirmDiscard();
    guard.discardDialogProps.onConfirm();
    // Radix also emits onOpenChange(false) while closing the dialog.
    guard.discardDialogProps.onCancel();
    expect(unloadIsBlocked()).toBe(false);
    expect(await choice).toBe(true);
    // A later unrelated unload is still protected if navigation did not finish.
    expect(unloadIsBlocked()).toBe(true);
  });

  it("keeps protection when the user chooses to keep editing", async () => {
    const guard = useUnsavedChangesGuard(true);
    const choice = guard.confirmDiscard();
    guard.discardDialogProps.onCancel();
    expect(await choice).toBe(false);
    expect(unloadIsBlocked()).toBe(true);
  });

  it("does not block a clean editor", async () => {
    const guard = useUnsavedChangesGuard(false);
    expect(await guard.confirmDiscard()).toBe(true);
    expect(unloadIsBlocked()).toBe(false);
  });
});
