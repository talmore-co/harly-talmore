"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { saveInterviewReminderSettings } from "./reminder-settings-actions";
import {
  DEFAULT_INTERVIEW_REMINDER,
  interviewReminderSettingsSchema,
  type InterviewReminderSettings as Settings,
} from "./reminder-settings";

export function InterviewReminderSettings({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [hours, setHours] = useState(String(initial.hoursBefore));
  const [pending, startSave] = useTransition();
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(saved) ||
    hours !== String(saved.hoursBefore);
  const zones = [
    ...new Set([
      settings.timeZone,
      "UTC",
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  ];

  function save() {
    const parsed = interviewReminderSettingsSchema.safeParse({
      ...settings,
      hoursBefore: hours.trim() ? Number(hours) : NaN,
    });
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? "Check the reminder settings.",
      );
      return;
    }
    startSave(async () => {
      try {
        const result = await saveInterviewReminderSettings(parsed.data);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setSettings(parsed.data);
        setSaved(parsed.data);
        setHours(String(parsed.data.hoursBefore));
        toast.success("Interview reminder settings saved.");
      } catch {
        toast.error("Could not save interview reminders. Please try again.");
      }
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        icon={CalendarClock}
        title="Interview reminders"
        description="Send candidates a reminder before their scheduled interview."
        badge={
          <StatusPill tone={saved.enabled ? "on" : "off"}>
            {saved.enabled ? "On" : "Off"}
          </StatusPill>
        }
      />
      <form
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset disabled={pending} className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div className="space-y-1">
              <Label htmlFor="interview-reminders-enabled">
                Send candidate reminders
              </Label>
              <p className="text-sm text-muted-foreground">
                Applies across the workspace. Canceled and completed interviews
                are excluded.
              </p>
            </div>
            <Switch
              id="interview-reminders-enabled"
              checked={settings.enabled}
              onCheckedChange={(enabled) =>
                setSettings({ ...settings, enabled })
              }
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reminder-hours">Hours before the interview</Label>
              <Input
                id="reminder-hours"
                type="number"
                min={0.25}
                max={720}
                step="any"
                required
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                From 15 minutes to 30 days before.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-timezone">
                Time zone used in the message
              </Label>
              <Select
                value={settings.timeZone}
                onValueChange={(timeZone) =>
                  setSettings({ ...settings, timeZone })
                }
              >
                <SelectTrigger id="reminder-timezone" className="w-full">
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
              <p className="text-xs text-muted-foreground">
                The message includes the time zone beside the interview time.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-reminders">For Cal.com interviews</Label>
            <Select
              value={settings.calReminders}
              onValueChange={(calReminders: Settings["calReminders"]) =>
                setSettings({ ...settings, calReminders })
              }
            >
              <SelectTrigger id="cal-reminders" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">Use Cal.com settings</SelectItem>
                <SelectItem value="talmore">
                  Send reminders from Talmore
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {settings.calReminders === "provider"
                ? "Talmore skips Cal.com bookings. Manage their reminders in each recruiter's Cal.com account."
                : "Turn off Cal.com reminder workflows in each recruiter's account to avoid duplicate emails. This setting does not change Cal.com itself."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-subject">Subject</Label>
            <Input
              id="reminder-subject"
              required
              maxLength={200}
              value={settings.subject}
              onChange={(event) =>
                setSettings({ ...settings, subject: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="reminder-message">Message</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSettings({
                    ...settings,
                    subject: DEFAULT_INTERVIEW_REMINDER.subject,
                    body: DEFAULT_INTERVIEW_REMINDER.body,
                  })
                }
              >
                Use suggested wording
              </Button>
            </div>
            <Textarea
              id="reminder-message"
              required
              maxLength={10000}
              rows={12}
              value={settings.body}
              onChange={(event) =>
                setSettings({ ...settings, body: event.target.value })
              }
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Available variables:{" "}
              {
                "{{candidate.firstName}}, {{candidate.lastName}}, {{job.title}}, {{interview.when}}, {{interview.location}}"
              }
            </p>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
          <p className="max-w-md text-xs text-muted-foreground">
            Rescheduling updates the reminder automatically. Changes apply to
            future reminders; previously queued reminders are canceled when you
            save.
          </p>
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
