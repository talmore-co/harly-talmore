"use client";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { isValidTimeZone } from "@/lib/timezone";

export function TimezonePicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => {
    const values =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : ["Asia/Manila", "UTC"];
    return Array.from(
      new Set([
        "UTC",
        ...values,
        ...(value && isValidTimeZone(value) ? [value] : []),
      ]),
    ).sort();
  }, [value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Timezone"
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {value ? value.replaceAll("_", " ") : "Use browser timezone"}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search city or timezone…" />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="automatic browser timezone"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={`size-4 ${value ? "opacity-0" : "opacity-100"}`}
                />
                Use browser timezone
              </CommandItem>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone.replaceAll("_", " ")}
                  keywords={
                    zone === "Asia/Manila"
                      ? ["Philippines", "PHT", "UTC+8"]
                      : []
                  }
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`size-4 ${value === zone ? "opacity-100" : "opacity-0"}`}
                  />
                  {zone.replaceAll("_", " ")}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
