"use client";

import { useEffect, useRef, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@/lib/utils";

/** Date-only values stay in local calendar time, without UTC conversion. */
export function DatePicker({
  id,
  value: controlledValue,
  onChange,
  disabled,
  className,
  defaultValue = "",
  name,
  required,
  min,
  max,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  min?: string;
  max?: string;
  "aria-label"?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const change = (next: string) => {
    setInternalValue(next);
    onChange?.(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      value && ((min && value < min) || (max && value > max))
        ? "Choose a date within the allowed range."
        : "",
    );
  }, [value, min, max]);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            ref={triggerRef}
            aria-label={ariaLabel}
            aria-required={required}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-10 w-full min-w-0 justify-between px-3 text-left font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">
              {selected ? format(selected, "MMM d, yyyy") : "Pick a date"}
            </span>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            required={required}
            selected={selected}
            defaultMonth={selected}
            autoFocus
            disabled={(date) => {
              const key = format(date, "yyyy-MM-dd");
              return Boolean((min && key < min) || (max && key > max));
            }}
            onSelect={(date: Date | undefined) => {
              change(date ? format(date, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
          />
          {selected && !required && (
            <div className="border-t p-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  change("");
                  setOpen(false);
                }}
              >
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <input
        ref={inputRef}
        type="text"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
          setOpen(true);
        }}
      />
    </>
  );
}
