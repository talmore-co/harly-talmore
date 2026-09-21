"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function CurrencyPicker({
  id,
  name,
  value,
  defaultValue = "USD",
  onChange,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;
  const currencies = useMemo(() => {
    const names = new Intl.DisplayNames("en", { type: "currency" });
    return [...new Set([...Intl.supportedValuesOf("currency"), selected])]
      .sort()
      .map((code) => ({ code, label: names.of(code) ?? code }));
  }, [selected]);
  return (
    <>
      {name && <input type="hidden" name={name} value={selected} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Currency"
            className={cn("w-full justify-between font-normal", className)}
          >
            <span className="truncate">{selected}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] p-0"
        >
          <Command>
            <CommandInput placeholder="Search currency or code…" />
            <CommandList>
              <CommandEmpty>No currency found.</CommandEmpty>
              <CommandGroup>
                {currencies.map(({ code, label }) => (
                  <CommandItem
                    key={code}
                    value={`${code} ${label}`}
                    keywords={code === "PHP" ? ["Philippines", "peso"] : []}
                    onSelect={() => {
                      setInternalValue(code);
                      onChange?.(code);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        selected === code ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="w-9 shrink-0 font-medium">{code}</span>
                    <span>{label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
