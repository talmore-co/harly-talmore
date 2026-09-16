"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCandidateContextAction } from "@/features/ai-chat/actions";
import { HarlyAIPanel } from "./HarlyAIPanel";
import { MessageCircle, X } from "lucide-react";
import { AssistantPortrait, useAssistantPersona } from "@/features/account/AssistantPersona";

type HarlyAIContextValue = {
  /** Whether the AI panel is currently open. */
  open: boolean;
  /** Toggle the panel from the floating chat launcher. */
  toggle: () => void;
  /** False when the workspace has no usable AI config , the trigger hides. */
  enabled: boolean;
};

const HarlyAIContext = createContext<HarlyAIContextValue>({
  open: false,
  toggle: () => {},
  enabled: false,
});

/** Shared chat visibility for dashboard controls. */
export function useHarlyAI() {
  return useContext(HarlyAIContext);
}

function candidateIdFromPath(pathname: string | null): string | undefined {
  const match = pathname?.match(
    /^\/dashboard\/candidates\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  return match?.[1];
}

function surfaceLabelFromPath(pathname: string | null): string {
  if (!pathname || pathname === "/dashboard") return "Dashboard";
  if (pathname.includes("/tasks")) return "Tasks";
  if (pathname.includes("/calendars")) return "Interview calendar";
  if (pathname.includes("/reports")) return "Reports";
  if (pathname.includes("/inbox")) return "Inbox";
  if (pathname.includes("/jobs")) return "Jobs";
  if (pathname.includes("/candidates")) return "Candidates";
  return "Current workspace";
}

/**
 * Hosts the AI panel and publishes its toggle through context.
 *
 * The selected persona appears in a floating launcher at the bottom right.
 */
export function HarlyAIProvider({
  userName,
  userId,
  workspaceId,
  aiEnabled,
  candidateId,
  children,
}: {
  userName: string;
  userId: string;
  workspaceId: string;
  aiEnabled: boolean;
  /** Optional candidate context, so the conversation is erased with the candidate (IA-02). */
  candidateId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const persona = useAssistantPersona();
  const [storageReady, setStorageReady] = useState(false);
  const [candidateContext, setCandidateContext] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const pathname = usePathname();
  const persistenceKey = `${workspaceId}:${userId}`;
  const activeCandidateId = candidateId ?? candidateIdFromPath(pathname);
  const surfaceContext = {
    kind: activeCandidateId ? ("candidate" as const) : ("section" as const),
    label: activeCandidateId
      ? candidateContext?.id === activeCandidateId
        ? candidateContext.name
        : "Current candidate"
      : surfaceLabelFromPath(pathname),
    path: pathname ?? "/dashboard",
  };

  useEffect(() => {
    try {
      setOpen(window.sessionStorage.getItem(`harly-ai:open:${persistenceKey}`) === "1");
    } finally {
      setStorageReady(true);
    }
  }, [persistenceKey]);

  useEffect(() => {
    if (!storageReady) return;
    window.sessionStorage.setItem(`harly-ai:open:${persistenceKey}`, open ? "1" : "0");
  }, [open, persistenceKey, storageReady]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCandidateId) {
      return () => {
        cancelled = true;
      };
    }
    void getCandidateContextAction(activeCandidateId).then((context) => {
      if (!cancelled) setCandidateContext(context);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCandidateId]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(
    () => ({ open, toggle, enabled: aiEnabled }),
    [open, toggle, aiEnabled],
  );

  return (
    <HarlyAIContext value={value}>
      {children}
      {aiEnabled && (
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-label={open ? `Close ${persona.name}` : `Ask ${persona.name}`}
          aria-expanded={open}
          title={open ? `Close ${persona.name}` : `Ask ${persona.name}, your AI assistant`}
          className="fixed bottom-4 right-4 z-50 flex size-14 items-center justify-center rounded-full border border-border bg-card shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:right-6"
        >
          {open ? <X className="size-5" /> : <><AssistantPortrait size={48} /><span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground"><MessageCircle className="size-3" aria-hidden="true" /></span></>}
        </button>
      )}
      <HarlyAIPanel
        userName={userName}
        persistenceKey={persistenceKey}
        aiEnabled={aiEnabled}
        open={open}
        onClose={() => setOpen(false)}
        candidateId={activeCandidateId}
        surfaceContext={surfaceContext}
      />
    </HarlyAIContext>
  );
}
