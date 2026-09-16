import type { ComponentProps } from "react";
import { JobOverviewBody } from "./JobOverviewBody";
import { sanitizeRichHtml } from "../sanitize-rich-html.server";

function ServerRichBody({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />;
}

/** Published descriptions are readable before hydration; editor previews stay live. */
export function ServerJobOverviewBody({ job }: Pick<ComponentProps<typeof JobOverviewBody>, "job">) {
  return <JobOverviewBody job={job} RichContent={ServerRichBody} />;
}
