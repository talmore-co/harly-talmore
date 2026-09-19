"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";

export function JobsClientFilter({
  value,
  options,
}: {
  value: string;
  options: { id: string; name: string }[];
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  return (
    <FilterPill
      label="Client"
      value={value === "all" ? FILTER_ALL : value}
      options={["none", ...options.map((client) => client.id)]}
      labelMap={{
        none: "No client assigned",
        ...Object.fromEntries(
          options.map((client) => [client.id, client.name]),
        ),
      }}
      onChange={(clientId) => {
        const next = new URLSearchParams(params.toString());
        if (clientId === FILTER_ALL) next.delete("clientId");
        else next.set("clientId", clientId);
        router.push(`${pathname}${next.size ? `?${next}` : ""}` as Route);
      }}
    />
  );
}
