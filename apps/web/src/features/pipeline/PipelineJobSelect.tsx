"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Briefcase, Check, ChevronsUpDown } from "lucide-react";

import type { PipelineJobOption } from "@/features/pipeline/data";
import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type PipelineJobSelectProps = {
  jobs: PipelineJobOption[];
  selectedJobId: string;
};

export function PipelineJobSelect({
  jobs,
  selectedJobId,
}: PipelineJobSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const options: PipelineJobOption[] = [{ id: "all", title: "All open jobs", status: "open" }, ...jobs];
  const selected = options.find((job) => job.id === selectedJobId) ?? jobs[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full max-w-sm justify-between gap-2 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Briefcase className="size-4" />
            </span>
            <span className="truncate font-medium">{selected?.title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {selected && selected.id !== "all" ? <JobStatusBadge status={selected.status} /> : null}
            <ChevronsUpDown className="size-4 opacity-60" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-72"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch job
        </DropdownMenuLabel>
        {options.map((job) => (
          <DropdownMenuItem
            key={job.id}
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              next.delete("scope"); next.delete("job"); next.delete("page"); next.delete("queue");
              next.set("jobId", job.id);
              if (job.id !== "all") next.delete("clientId");
              if (job.id === "all") next.set("view", "list");
              router.push(`/dashboard/pipeline?${next}` as Route);
            }}
            className="gap-2"
          >
            <Check
              className={cn(
                "size-4 shrink-0",
                job.id === selected?.id ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{job.title}</span>
            {job.id !== "all" ? <JobStatusBadge status={job.status} /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
