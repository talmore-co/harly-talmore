"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/notification-island/toast";
import {
  disconnectMyGoogleConnection, listMyGoogleCalendars, saveMyGoogleCalendars,
  type getMyGoogleConnection,
} from "./google-actions";

type Calendar = { id: string; name: string; writable: boolean };

export function GoogleConnectionCard({ status, error }: {
  status: Awaited<ReturnType<typeof getMyGoogleConnection>>;
  error?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [calendarId, setCalendarId] = useState(status.connection?.calendarId ?? "");
  const [availabilityIds, setAvailabilityIds] = useState(status.connection?.availabilityCalendarIds ?? []);
  const [message, setMessage] = useState(error ?? "");
  const connected = Boolean(status.connection?.enabled);

  function loadCalendars() {
    startTransition(async () => {
      const result = await listMyGoogleCalendars();
      if (!result.ok) { setMessage(result.error); router.refresh(); return; }
      setCalendars(result.calendars);
      setMessage("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Calendar &amp; Meet</CardTitle>
        <CardDescription>
          Connect your account to check your availability and host interviews assigned to you in this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">
          {connected ? `Connected as ${status.connection?.accountEmail}` : "Your Google Calendar is not connected."}
        </p>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        {!status.configured && <p className="text-sm text-muted-foreground">Ask an administrator to configure Google OAuth and encryption on the server.</p>}
        <div className="flex flex-wrap gap-2">
          {status.configured && (
            <Button asChild variant={connected ? "outline" : "default"}>
              <a href={`/api/integrations/google/install?ws=${encodeURIComponent(status.workspaceId)}&scope=personal`}>
                {status.connection ? "Reconnect Google" : "Connect Google"}
              </a>
            </Button>
          )}
          {connected && <>
            <Button variant="outline" disabled={pending} onClick={loadCalendars}>
              {pending ? "Working…" : "Choose calendars / test connection"}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
              await disconnectMyGoogleConnection();
              setCalendars(null);
              toast.success("Google Calendar disconnected");
              router.refresh();
            })}>Disconnect</Button>
          </>}
        </div>
        {connected && <p className="text-xs text-muted-foreground">
          Existing events keep their original calendar and host. Disconnecting pauses calendar updates until you reconnect the same account.
        </p>}
        {connected && calendars && <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="personal-interview-calendar">Interview calendar</Label>
            <select id="personal-interview-calendar" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={calendarId}
              onChange={(event) => {
                setCalendarId(event.target.value);
                setAvailabilityIds((ids) => [...new Set([...ids, event.target.value])]);
              }}>
              {calendars.filter((c) => c.writable).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Calendars checked for availability</legend>
            {calendars.map((calendar) => <label key={calendar.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={calendar.id === calendarId || availabilityIds.includes(calendar.id)}
                disabled={calendar.id === calendarId}
                onChange={(event) => setAvailabilityIds((ids) => event.target.checked
                  ? [...new Set([...ids, calendar.id])] : ids.filter((id) => id !== calendar.id))} />
              {calendar.name}
            </label>)}
          </fieldset>
          <Button disabled={pending} onClick={() => startTransition(async () => {
            const result = await saveMyGoogleCalendars({ calendarId, availabilityCalendarIds: availabilityIds });
            if (!result.ok) { setMessage(result.error ?? "Could not save calendars."); return; }
            setMessage(""); toast.success("Calendar preferences saved"); router.refresh();
          })}>Save calendars</Button>
        </div>}
      </CardContent>
    </Card>
  );
}
