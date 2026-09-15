"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { parseMultiSelectAnswer } from "./multi-select";

export function MultiSelectQuestion({
  name,
  label,
  options,
  value,
  onChange,
  required = false,
  invalid = false,
}: {
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  invalid?: boolean;
}) {
  const selected = parseMultiSelectAnswer(value) ?? [];
  return (
    <fieldset
      id={name}
      className="mt-1.5 space-y-2"
      aria-invalid={invalid || undefined}
    >
      <legend className="sr-only">
        {label}
        {required ? " (required)" : ""}
      </legend>
      <input type="hidden" name={name} value={value} />
      <p className="text-sm text-muted-foreground">Select all that apply.</p>
      {options.map((option) => (
        <label
          key={option}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm leading-5 hover:bg-muted/30"
        >
          <Checkbox
            className="mt-0.5 shrink-0"
            checked={selected.includes(option)}
            onCheckedChange={(checked) => {
              const next = new Set(selected);
              if (checked === true) next.add(option);
              else next.delete(option);
              onChange(
                JSON.stringify(options.filter((item) => next.has(item))),
              );
            }}
          />
          <span>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}
