"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";

import { applyPipelineViewParams } from "./view-params";

type ViewParamValues = Parameters<typeof applyPipelineViewParams>[1];

/**
 * Mirrors pipeline filters into the URL. The component keeps its own state so
 * typing stays instant; the URL follows a moment later through `router.replace`
 * (no history entry, no scroll jump). The query string is read at write time,
 * so a stage or job change made in between is never overwritten.
 */
export function usePipelineViewParams(values: ViewParamValues) {
  const router = useRouter();
  const pathname = usePathname();
  const serialized = JSON.stringify(values);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = new URLSearchParams(window.location.search).toString();
      const next = applyPipelineViewParams(
        current,
        JSON.parse(serialized) as ViewParamValues,
      );
      if (next === current) return;
      router.replace(`${pathname}${next ? `?${next}` : ""}` as Route, {
        scroll: false,
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [pathname, router, serialized]);
}
