"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ImportSearchSelect({ label, value, onChange, options, disabled, preserveOrder = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  disabled?: boolean;
  preserveOrder?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const sorted = preserveOrder ? options : [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id));
  const search = query.trim().toLocaleLowerCase();
  const visible = sorted.filter(option => `${option.name} ${option.id}`.toLocaleLowerCase().includes(search));
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} className="w-full justify-between gap-2 font-normal">
          <span className="truncate">{options.find(option => option.id === value)?.name || `Choose ${label.toLowerCase()}`}</span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-64 overscroll-contain">
            <CommandEmpty>No matches found.</CommandEmpty>
            <CommandGroup>{visible.map(option => <CommandItem key={option.id} value={option.id} onSelect={() => { onChange(option.id); setOpen(false); setQuery(""); }}>
              <Check className={cn("size-4 shrink-0", value === option.id ? "opacity-100" : "opacity-0")} /><span className="break-words">{option.name}</span>
            </CommandItem>)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}
