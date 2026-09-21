"use client";

import { Check, Minus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DimensionResponse,
  ScorecardDimension,
} from "./scorecard-definition";

export function RatingChoices({
  type,
  value,
  onChange,
  label,
  anchors = [],
  disabled,
  clearable = true,
}: {
  type: ScorecardDimension["type"];
  value: DimensionResponse["value"];
  onChange: (value: DimensionResponse["value"]) => void;
  label: string;
  anchors?: string[];
  disabled?: boolean;
  clearable?: boolean;
}) {
  const options =
    type === "recommendation"
      ? [
          { value: "strong", label: "Strong", icon: ThumbsUp },
          { value: "mixed", label: "Mixed", icon: Minus },
          { value: "weak", label: "Weak", icon: ThumbsDown },
        ]
      : type === "boolean"
        ? [
            { value: true, label: "Yes", icon: Check },
            { value: false, label: "No", icon: X },
          ]
        : [1, 2, 3, 4, 5].map((number) => ({
            value: number,
            label: String(number),
            icon: null,
          }));
  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={label}
        className={cn(
          "grid gap-2",
          type === "scale"
            ? "grid-cols-5"
            : type === "boolean"
              ? "grid-cols-2"
              : "grid-cols-3",
        )}
      >
        {options.map((option) => (
          <Button
            key={String(option.value)}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-pressed={value === option.value}
            aria-label={
              type === "scale"
                ? `${option.label}: ${anchors[Number(option.value) - 1]}`
                : option.label
            }
            title={
              type === "scale" ? anchors[Number(option.value) - 1] : undefined
            }
            onClick={() => onChange(option.value)}
            className={cn(
              "h-auto min-w-0 flex-col gap-1.5 rounded-xl px-2 py-3 text-sm",
              value === option.value
                ? "border-primary/40 bg-accent text-accent-foreground hover:bg-accent"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {option.icon ? (
              <option.icon className="size-5" strokeWidth={1.8} />
            ) : null}
            {option.label}
          </Button>
        ))}
      </div>
      {clearable ? (
        <div className="flex min-h-6 items-start justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {value === null
              ? "Not assessed"
              : type === "scale"
                ? anchors[Number(value) - 1]
                : ""}
          </span>
          {value !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto shrink-0 px-1 py-0 text-xs"
              disabled={disabled}
              onClick={() => onChange(null)}
              aria-label={`Clear ${label}`}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
