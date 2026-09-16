"use client";

import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import dynamic from "next/dynamic";

import type { CareerPageConfig } from "./config";
import type { Job } from "./types";
import { ThemeWrapper } from "./ThemeWrapper";
const PlayfulTemplate = dynamic(() => import("./templates/PlayfulTemplate").then(m => m.PlayfulTemplate));
const MinimalTemplate = dynamic(() => import("./templates/MinimalTemplate").then(m => m.MinimalTemplate));
const AshbyTemplate = dynamic(() => import("./templates/AshbyTemplate").then(m => m.AshbyTemplate));
const JoinTemplate = dynamic(() => import("./templates/JoinTemplate").then(m => m.JoinTemplate));

/**
 * Renders the public career page from live config. Switch picks the template
 * component based on config.template, wraps it in ThemeWrapper to apply
 * mode/background/font. All templates receive the same props (config-driven).
 * Greenhouse configs fall back to Minimal.
 */
export function CareerPageRender({
  config,
  workspace,
  jobs,
  boardRoot,
  portalEnabled = false,
}: {
  config: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  boardRoot: string;
  portalEnabled?: boolean;
}) {
  const templateMap = {
    minimal: MinimalTemplate,
    playful: PlayfulTemplate,
    ashby: AshbyTemplate,
    join: JoinTemplate,
  } as const;

  const TemplateComponent =
    config.template !== "" && config.template in templateMap
      ? templateMap[config.template as keyof typeof templateMap]
      : MinimalTemplate;

  return (
    <ThemeWrapper config={config}>
      <TemplateComponent
        config={config}
        workspace={workspace}
        jobs={jobs}
        boardRoot={boardRoot}
        portalEnabled={portalEnabled}
      />
    </ThemeWrapper>
  );
}
