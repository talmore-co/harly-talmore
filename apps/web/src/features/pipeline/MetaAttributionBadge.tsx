"use client";

import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortDateTime } from "@/lib/date-hydration";
import { metaAdAttribution } from "./meta-attribution";

const sourceNames: Record<string, string> = {
  fb: "Facebook", facebook: "Facebook", ig: "Instagram", instagram: "Instagram",
  an: "Meta Audience Network", audience_network: "Meta Audience Network",
  msg: "Messenger", messenger: "Messenger", th: "Threads", threads: "Threads", meta: "Meta",
};

export function MetaAttributionBadge({ value }: { value: unknown }) {
  const attribution = metaAdAttribution(value);
  if (!attribution) return null;
  const sameVisit = JSON.stringify(attribution.first) === JSON.stringify(attribution.last);
  const touches = sameVisit ? (["last"] as const) : (["first", "last"] as const);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="img"
          aria-label="Meta ad attribution recorded"
          className="ml-1 inline-flex shrink-0 items-center rounded-sm align-middle text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          <Icon icon="simple-icons:meta" width={15} height={15} aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-3 whitespace-normal p-3 text-left">
        <p className="font-semibold">Meta ad attribution recorded</p>
        {touches.map(kind => {
          const touch = attribution[kind];
          const rows = [
            ["Ad", touch.utm_content ?? touch.ad_id],
            ["Source", sourceNames[touch.utm_source?.toLowerCase() ?? ""] ?? touch.utm_source], ["Medium", touch.utm_medium],
            ["Campaign", touch.utm_campaign], ["Campaign ID", touch.campaign_id],
            ["Ad set ID", touch.adset_id], ["Ad ID", touch.ad_id],
            ["Landing page", touch.landingPath],
          ];
          return <section key={kind} className="space-y-1">
            <p className="font-medium">{sameVisit ? "Tracked visit" : kind === "first" ? "First tracked visit" : "Latest tracked visit"}</p>
            <dl className="space-y-1 break-words">
              {rows.map(([label, detail]) => detail ? <div key={label}><dt className="inline opacity-75">{label}: </dt><dd className="inline">{detail}</dd></div> : null)}
              <div><dt className="inline opacity-75">Captured: </dt><dd className="inline"><ShortDateTime value={touch.capturedAt} /></dd></div>
            </dl>
          </section>;
        })}
        <p className="text-[11px] opacity-75">Saved link attribution; not independently verified by Meta.</p>
      </TooltipContent>
    </Tooltip>
  );
}
