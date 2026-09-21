"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";

type Booking = {
  jobTitle: string;
  firstName: string;
  durationMins: number;
  state: "open" | "booking" | "confirmed" | "review" | "canceled";
  slots: string[];
};
const dateKey = (value: Date, zone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export function InterviewBookingPage() {
  const token = useRef("");
  const requestSequence = useRef(0);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timeZone, setTimeZone] = useState("UTC");
  const [day, setDay] = useState("");
  const [selected, setSelected] = useState("");
  const [zones, setZones] = useState(["UTC"]);
  const [now] = useState(() => new Date());

  const load = useCallback(
    async (
      from?: string,
      confirmation?: { start: string; timeZone: string },
    ) => {
      if (!token.current) {
        setError("Open the personal booking link in your invitation email.");
        return;
      }
      const sequence = ++requestSequence.current;
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/booking/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(
            confirmation
              ? { action: "confirm", token: token.current, ...confirmation }
              : {
                  action: "availability",
                  token: token.current,
                  ...(from ? { from } : {}),
                },
          ),
        });
        const data = (await response.json()) as Booking & { error?: string };
        if (!response.ok)
          throw new Error(data.error ?? "Please try again shortly.");
        if (sequence === requestSequence.current) {
          setBooking(data);
          setSelected("");
        }
      } catch (cause) {
        if (sequence === requestSequence.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Please try again shortly.",
          );
          setSelected("");
        }
      } finally {
        if (sequence === requestSequence.current) setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    token.current = window.location.hash.slice(1);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void load().then(() => {
      setTimeZone(zone);
      setZones([
        ...new Set([zone, "UTC", ...Intl.supportedValuesOf("timeZone")]),
      ]);
    });
  }, [load]);

  const visibleSlots =
    booking?.slots.filter(
      (slot) => !day || dateKey(new Date(slot), timeZone) === day,
    ) ?? [];
  const grouped = new Map<string, string[]>();
  for (const slot of visibleSlots) {
    const date = dateKey(new Date(slot), timeZone);
    grouped.set(date, [...(grouped.get(date) ?? []), slot]);
  }
  const today = dateKey(now, timeZone);
  const max = dateKey(new Date(now.getTime() + 60 * 86400000), timeZone);
  const status = booking?.state;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <p className="mb-8 text-xl font-semibold tracking-tight">Talmore</p>
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <CalendarDays className="mt-1 size-6 shrink-0 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {status === "confirmed"
                  ? "Your interview is booked"
                  : "Choose an interview time"}
              </h1>
              {booking && (
                <p className="mt-2 text-muted-foreground">
                  {booking.jobTitle} with Talmore
                </p>
              )}
            </div>
          </div>
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
            >
              {error}
            </div>
          )}
          {!booking && (
            <Button disabled={busy} onClick={() => void load()}>
              {busy ? "Loading availability…" : "Try again"}
            </Button>
          )}
          {status === "confirmed" && (
            <div className="space-y-3">
              <CheckCircle2 className="size-8 text-green-700" />
              <p>
                Check your email for the calendar invitation and meeting
                details.
              </p>
              <p className="text-sm text-muted-foreground">
                Use the links in your Cal.com confirmation email to reschedule
                or cancel.
              </p>
            </div>
          )}
          {(status === "booking" || status === "review") && (
            <div className="space-y-4">
              <p>
                Your booking is being confirmed. Please do not book another
                time.
              </p>
              <p className="text-sm text-muted-foreground">
                If you have not received a confirmation email, check again
                shortly or contact your recruiter.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void load()}
              >
                {busy ? "Checking…" : "Check booking status"}
              </Button>
            </div>
          )}
          {status === "canceled" && (
            <p>
              This interview was canceled. Please contact your recruiter to
              arrange another time.
            </p>
          )}
          {booking && status === "open" && (
            <div className="space-y-6">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="size-4" />
                {booking.durationMins} minutes · One Talmore recruiter
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="booking-day" className="text-sm font-medium">
                    Date
                  </label>
                  <DatePicker
                    id="booking-day"
                    value={day}
                    min={today}
                    max={max}
                    disabled={busy}
                    onChange={(value) => {
                      setDay(value);
                      setSelected("");
                      const from = value
                        ? new Date(`${value}T00:00:00Z`)
                        : undefined;
                      if (from) from.setUTCDate(from.getUTCDate() - 1);
                      void load(
                        from && from.getTime() > Date.now()
                          ? from.toISOString()
                          : undefined,
                      );
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="booking-zone" className="text-sm font-medium">
                    Your time zone
                  </label>
                  <Select
                    value={timeZone}
                    disabled={busy}
                    onValueChange={(zone) => {
                      setTimeZone(zone);
                      setSelected("");
                    }}
                  >
                    <SelectTrigger id="booking-zone" className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div aria-live="polite" aria-busy={busy} className="space-y-5">
                {busy ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : visibleSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No available times here. Choose another date or contact your
                    recruiter.
                  </p>
                ) : (
                  [...grouped].map(([date, slots]) => (
                    <div key={date}>
                      <h2 className="mb-3 text-sm font-medium">
                        {new Intl.DateTimeFormat("en", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          timeZone,
                        }).format(new Date(slots[0]!))}
                      </h2>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {slots.map((slot) => (
                          <Button
                            key={slot}
                            variant={selected === slot ? "default" : "outline"}
                            aria-pressed={selected === slot}
                            onClick={() => setSelected(slot)}
                          >
                            {new Intl.DateTimeFormat("en", {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone,
                              timeZoneName: "short",
                            }).format(new Date(slot))}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selected && (
                <div className="space-y-3 border-t pt-5">
                  <p className="text-sm">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "full",
                      timeStyle: "short",
                      timeZone,
                    }).format(new Date(selected))}{" "}
                    · {timeZone}
                  </p>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={busy}
                    onClick={() =>
                      void load(undefined, { start: selected, timeZone })
                    }
                  >
                    Confirm interview
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                These times reflect availability across our recruiting team.
                Your calendar invitation will identify your interviewer.
              </p>
            </div>
          )}
        </section>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          This invitation is personal to you. Please keep the link private.
        </p>
      </div>
    </main>
  );
}
