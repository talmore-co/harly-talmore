"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { candidateProfileHref } from "@/features/candidates/directory-params";

/**
 * Always-visible prev/next candidate navigation, next to "Back to
 * candidates" in the page header , not gated on scroll like the sticky bar.
 */
export function CandidatePager({
  prevId,
  nextId,
  position,
  total,
  listQuery = "",
}: {
  prevId: string | null;
  nextId: string | null;
  position: number | null;
  total: number;
  /** Directory query string of the list being paged through. */
  listQuery?: string;
}) {
  const router = useRouter();

  if (position === null || total === 0) return null;

  function go(id: string | null) {
    if (!id) return;
    router.push(candidateProfileHref(id, listQuery) as Route);
  }

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <Button
        size="sm"
        variant="ghost"
        className="size-8 p-0 disabled:opacity-30"
        disabled={!prevId}
        onClick={() => go(prevId)}
        title="Previous candidate"
      >
        <ChevronLeft className="size-4" />
        <span className="sr-only">Previous candidate</span>
      </Button>
      <span className="tabular-nums">
        Candidate {position} of {total}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="size-8 p-0 disabled:opacity-30"
        disabled={!nextId}
        onClick={() => go(nextId)}
        title="Next candidate"
      >
        <ChevronRight className="size-4" />
        <span className="sr-only">Next candidate</span>
      </Button>
    </div>
  );
}
