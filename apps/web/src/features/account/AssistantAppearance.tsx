"use client";

import { useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";
import {
  assistantPersonas,
  useAssistantPersona,
  type AssistantPersonaId,
} from "./AssistantPersona";
import { saveAssistantPersona } from "./assistant-actions";

export function AssistantAppearance() {
  const current = useAssistantPersona();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose who greets you on the dashboard and helps you in chat. Both have
        the same AI capabilities. Saves automatically across your devices.
      </p>
      <div
        className="grid grid-cols-2 gap-3"
        role="group"
        aria-label="Assistant appearance"
      >
        {(
          Object.entries(assistantPersonas) as [
            AssistantPersonaId,
            (typeof assistantPersonas)[AssistantPersonaId],
          ][]
        ).map(([id, persona]) => (
          <button
            key={id}
            type="button"
            aria-pressed={current.id === id}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await saveAssistantPersona(id);
                  router.refresh();
                  toast.success(`${persona.name} is your assistant.`);
                } catch {
                  toast.error(
                    "Could not save assistant appearance. Please try again.",
                  );
                }
              })
            }
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors disabled:opacity-60 ${current.id === id ? "border-primary bg-accent" : "border-border hover:bg-muted"}`}
          >
            <Image
              src={persona.image}
              alt={persona.name}
              width={80}
              height={80}
              className="rounded-full"
            />
            <span className="text-sm font-medium">{persona.name}</span>
            <span className="text-xs text-muted-foreground">
              {current.id === id ? "Selected" : "Choose"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
