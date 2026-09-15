"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/** A shadcn Select composition that emits the existing 24-hour HH:mm value. */
export function TimePicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const hours = valid ? Number(value.slice(0, 2)) : 0;
  const minute = valid ? value.slice(3, 5) : "00";
  const hour = String(hours % 12 || 12).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  function update(nextHour: string, nextMinute: string, nextPeriod: string) {
    const h = (Number(nextHour) % 12) + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(h).padStart(2, "0")}:${nextMinute}`);
  }
  return (
    <div className="grid min-w-0 grid-cols-3 gap-1.5">
      <Select
        value={valid ? hour : ""}
        onValueChange={(h) => update(h, minute, period)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label="Hour"
          className="h-10! w-full min-w-0 gap-1 px-2"
        >
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }, (_, i) =>
            String(i + 1).padStart(2, "0"),
          ).map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={valid ? minute : ""}
        onValueChange={(m) => update(hour, m, period)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label="Minute"
          className="h-10! w-full min-w-0 gap-1 px-2"
        >
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
            (m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <Select
        value={period}
        onValueChange={(p) => update(hour, minute, p)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label="AM or PM"
          className="h-10! w-full min-w-0 gap-1 px-2"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
