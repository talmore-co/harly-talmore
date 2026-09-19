"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import { LayoutGrid, List } from "lucide-react";

import { cn } from "@/lib/utils";

/** Board ↔ List switch , board for small/medium, list for high volume. */
export function PipelineViewToggle({
  jobId,
  view,
  stage,
}: {
  jobId: string;
  view: "board" | "list";
  stage?: string;
}) {
  const searchParams = useSearchParams();
  const viewHref = (nextView: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("jobId", jobId); next.set("view", nextView);
    if (stage) next.set("stage", stage);
    else next.delete("stage");
    return `/dashboard/pipeline?${next}` as Route;
  };
  const items = [
    { key: "list" as const, label: "List", icon: List },
    { key: "board" as const, label: "Board", icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      {items.map((it) => (
        <Link
          key={it.key}
          href={viewHref(it.key)}
          aria-current={view === it.key ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
            view === it.key
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <it.icon className="size-4" strokeWidth={1.8} />
          {it.label}
        </Link>
      ))}
    </div>
  );
}
