"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/lib/notification-island/toast";
import {
  connectMyCalAccount,
  createMyCalEvent,
  disconnectMyCalAccount,
  getMyCalBookingMatches,
  listMyCalEvents,
  matchMyCalBooking,
  saveMyCalEvent,
  type getMyCalConnection,
} from "./cal-actions";

type Status = Awaited<ReturnType<typeof getMyCalConnection>>;
type Event = {
  id: number;
  title: string;
  durationMins: number;
  bookingUrl: string;
};

export function CalConnectionCard({ status }: { status: Status }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [events, setEvents] = useState<Event[] | null>(null);
  const [eventId, setEventId] = useState(
    String(status.connection?.defaultEventTypeId ?? ""),
  );
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Candidate screening");
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState("");
  const selected = events?.find((event) => String(event.id) === eventId);
  const current = status.events.find(
    (event) => event.eventTypeId === status.connection?.defaultEventTypeId,
  );
  async function loadEvents() {
    const result = await listMyCalEvents();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEvents(result.events);
    setError("");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cal.com self-scheduling</CardTitle>
        <CardDescription>
          Connect your personal account, choose an interview event and let
          candidates book their own time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {status.connection?.enabled && (
          <div className="space-y-1 text-sm">
            <p>Connected as {status.connection.accountEmail}</p>
            {current && (
              <p>
                Default event: {current.title} · {current.durationMins} minutes
              </p>
            )}
            <p>
              Booking sync:{" "}
              {current?.webhookConfigured
                ? "Configured"
                : "Choose an event to finish setup"}
            </p>
            <p className="text-muted-foreground">
              Last verified booking received:{" "}
              {status.connection.lastReceivedAt
                ? new Date(status.connection.lastReceivedAt).toLocaleString()
                : "None yet"}
            </p>
          </div>
        )}
        {!status.configured ? (
          <p className="text-sm text-muted-foreground">
            Ask an administrator to configure server encryption.
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="cal-api-key">
              Personal Cal.com API key
              {status.connection ? " · reconnect or replace key" : ""}
            </Label>
            <Input
              id="cal-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste your API key"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={pending || !apiKey.trim()}
                onClick={() =>
                  start(async () => {
                    const result = await connectMyCalAccount({ apiKey });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setApiKey("");
                    setError("");
                    toast.success("Cal.com connected");
                    await loadEvents();
                    router.refresh();
                  })
                }
              >
                Connect Cal.com
              </Button>
              <a
                className="text-sm underline"
                href="https://app.cal.com/settings/developer/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                Get an API key
              </a>
            </div>
          </div>
        )}
        {status.connection?.enabled && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => start(loadEvents)}
              >
                Choose event / test connection
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await disconnectMyCalAccount();
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setEvents(null);
                    setError("");
                    toast.success("Cal.com disconnected");
                    router.refresh();
                  })
                }
              >
                Disconnect
              </Button>
            </div>
            {events && (
              <div className="space-y-3">
                <Label htmlFor="cal-event">Default interview event</Label>
                <select
                  id="cal-event"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={eventId}
                  onChange={(event) => setEventId(event.target.value)}
                >
                  <option value="">Select an event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} · {event.durationMins} minutes
                    </option>
                  ))}
                </select>
                {selected && (
                  <a
                    className="block text-sm underline"
                    href={selected.bookingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview booking page
                  </a>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending || !selected}
                    onClick={() =>
                      start(async () => {
                        const result = await saveMyCalEvent({
                          eventTypeId: Number(eventId),
                        });
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        setError("");
                        toast.success(
                          "Interview event and booking sync configured",
                        );
                        router.refresh();
                      })
                    }
                  >
                    Save event &amp; configure sync
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => setCreating(!creating)}
                  >
                    Create an interview event
                  </Button>
                </div>
                {creating && (
                  <div className="space-y-3 rounded-md border p-3">
                    <Label htmlFor="cal-event-title">Event name</Label>
                    <Input
                      id="cal-event-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                    <Label htmlFor="cal-event-duration">
                      Duration in minutes
                    </Label>
                    <Input
                      id="cal-event-duration"
                      type="number"
                      min={5}
                      max={480}
                      value={duration}
                      onChange={(event) =>
                        setDuration(Number(event.target.value))
                      }
                    />
                    <Button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const result = await createMyCalEvent({
                            title,
                            durationMins: duration,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          await loadEvents();
                          setEventId(String(result.eventId));
                          setCreating(false);
                          toast.success(
                            "Event created. Review its settings in Cal.com, then configure sync.",
                          );
                        })
                      }
                    >
                      Create event
                    </Button>
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Set your availability, connected calendar and meeting location in{" "}
              <a
                className="underline"
                href="https://app.cal.com/event-types"
                target="_blank"
                rel="noreferrer"
              >
                Cal.com
              </a>
              . Cal.com sends invitations and manages these bookings. Changing
              your default keeps earlier event subscriptions active for existing
              bookings.
            </p>
          </div>
        )}
        {status.unmatched.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Bookings needing attention</h3>
            {status.unmatched.map((booking) => (
              <UnmatchedBooking key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnmatchedBooking({
  booking,
}: {
  booking: Status["unmatched"][number];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [matches, setMatches] = useState<Awaited<
    ReturnType<typeof getMyCalBookingMatches>
  > | null>(null);
  const [applicationId, setApplicationId] = useState(
    booking.applicationId ?? "",
  );
  function syncBooking() {
    start(async () => {
      const result = await matchMyCalBooking({
        bookingId: booking.id,
        applicationId: booking.applicationId ?? applicationId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking synchronized with application");
      router.refresh();
    });
  }
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p>
        {booking.attendeeName} · {booking.attendeeEmail}
      </p>
      <p>
        {new Date(booking.scheduledAt).toLocaleString()} · {booking.status}
      </p>
      <p className="text-muted-foreground">{booking.reason}</p>
      {booking.applicationId ? (
        <Button disabled={pending} onClick={syncBooking}>
          Retry booking sync
        </Button>
      ) : matches === null ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () =>
              setMatches(
                await getMyCalBookingMatches({ bookingId: booking.id }),
              ),
            )
          }
        >
          Find application
        </Button>
      ) : (
        <>
          <select
            aria-label="Application to match"
            className="h-10 w-full rounded-md border bg-background px-3"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          >
            <option value="">Choose an application</option>
            {matches.map((match) => (
              <option key={match.applicationId} value={match.applicationId}>
                {match.firstName} {match.lastName} · {match.jobTitle}
              </option>
            ))}
          </select>
          <Input
            aria-label="Application ID"
            placeholder="Or paste the application ID if the booking email differs"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          />
          <Button disabled={pending || !applicationId} onClick={syncBooking}>
            Match booking
          </Button>
        </>
      )}
    </div>
  );
}
