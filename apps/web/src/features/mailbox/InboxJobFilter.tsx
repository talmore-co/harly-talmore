"use client";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function InboxJobFilter({ value, jobs, onChange }: { value: string; jobs: { id: string; title: string }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = [{ id: "all", title: "All jobs" }, { id: "none", title: "No linked job" }, ...jobs];
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button id="inbox-job" variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label="Filter inbox by job" className="max-w-full justify-between gap-2 sm:w-72"><span className="truncate">{options.find((job) => job.id === value)?.title ?? "Selected job"}</span><ChevronsUpDown className="size-3.5 shrink-0" /></Button></PopoverTrigger><PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start"><Command><CommandInput placeholder="Search jobs…" /><CommandList><CommandEmpty>No jobs found.</CommandEmpty><CommandGroup>{options.map((job) => <CommandItem key={job.id} value={job.id} keywords={[job.title]} onSelect={() => { onChange(job.id); setOpen(false); }}><Check className={cn("size-4 shrink-0", value === job.id ? "opacity-100" : "opacity-0")} /><span>{job.title}</span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}
