"use client";

import { createContext, useContext, type ReactNode } from "react";
import Image from "next/image";

export const assistantPersonas = {
  maya: { name: "Maya", image: "/images/system-persona/f2.webp" },
  leo: { name: "Leo", image: "/images/system-persona/m1.webp" },
} as const;
export type AssistantPersonaId = keyof typeof assistantPersonas;
const PersonaContext = createContext<AssistantPersonaId>("maya");

export function AssistantPersonaProvider({
  value,
  children,
}: {
  value?: string | null;
  children: ReactNode;
}) {
  return (
    <PersonaContext.Provider value={value === "leo" ? "leo" : "maya"}>
      {children}
    </PersonaContext.Provider>
  );
}
export function useAssistantPersona() {
  const id = useContext(PersonaContext);
  return { id, ...assistantPersonas[id] };
}
export function AssistantPortrait({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const persona = useAssistantPersona();
  return (
    <Image
      src={persona.image}
      alt={`${persona.name}, Talmore AI assistant`}
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
export function AssistantName() {
  return useAssistantPersona().name;
}
