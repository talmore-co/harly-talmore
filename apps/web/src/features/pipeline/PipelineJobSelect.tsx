"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Briefcase, Check, ChevronsUpDown } from "lucide-react";

import type { PipelineJobOption } from "@/features/pipeline/data";
import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PipelineJobSelectProps = {
  jobs: PipelineJobOption[];
  selectedJobId: string;
  /** Client name per job id; empty when the viewer cannot see clients. */
  clientNames?: Record<string, string>;
};

export function PipelineJobSelect({
  jobs,
  selectedJobId,
  clientNames = {},
}: PipelineJobSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options: PipelineJobOption[] = [{ id: "all", title: "All open jobs", status: "open" }, ...jobs];
  const selected = options.find((job) => job.id === selectedJobId) ?? jobs[0];
  const selectedClient = selected ? clientNames[selected.id] : undefined;
  const search = query.trim().toLocaleLowerCase();
  const visible = options.filter((job) =>
    `${job.title} ${clientNames[job.id] ?? ""}`
      .toLocaleLowerCase()
      .includes(search),
  );

  function selectJob(jobId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("scope"); next.delete("job"); next.delete("page"); next.delete("queue");
    next.set("jobId", jobId);
    if (jobId !== "all") next.delete("clientId");
    if (jobId === "all") next.set("view", "list");
    setOpen(false);
    setQuery("");
    router.push(`/dashboard/pipeline?${next}` as Route);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="Switch job"
          aria-expanded={open}
          className="h-auto w-full max-w-sm justify-between gap-2 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Briefcase className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col items-start">
              <span className="max-w-full truncate font-medium">{selected?.title}</span>
              {selectedClient ? (
                <span className="max-w-full truncate text-xs font-normal text-muted-foreground">
                  {selectedClient}
                </span>
              ) : null}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {selected && selected.id !== "all" ? <JobStatusBadge status={selected.status} /> : null}
            <ChevronsUpDown className="size-4 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-2rem)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="Search jobs"
            placeholder="Search jobs…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-72 overscroll-contain">
            <CommandEmpty>No jobs found.</CommandEmpty>
            <CommandGroup>
              {visible.map((job) => (
                <CommandItem
                  key={job.id}
                  value={job.id}
                  onSelect={() => selectJob(job.id)}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      job.id === selected?.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{job.title}</span>
                    {clientNames[job.id] ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {clientNames[job.id]}
                      </span>
                    ) : null}
                  </span>
                  {job.id !== "all" ? <JobStatusBadge status={job.status} /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
