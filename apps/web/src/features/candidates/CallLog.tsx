"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { ShortDateTime } from "@/lib/date-hydration";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logCandidateCall, type listCandidateCalls } from "./call-actions";

export type CandidateCall = Awaited<
  ReturnType<typeof listCandidateCalls>
>[number];
const outcomes = {
  connected: "Connected",
  no_answer: "No answer",
  voicemail: "Left voicemail",
  busy: "Busy",
  wrong_number: "Wrong number",
};
const purposes = {
  scheduling: "Interview scheduling",
  follow_up: "Candidate follow-up",
  other: "Other",
};

export function LogCallDialog({
  candidateId,
  applications,
  selectedApplicationId,
}: {
  candidateId: string;
  applications: { id: string; title: string }[];
  selectedApplicationId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [id, setId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [applicationId, setApplicationId] = useState("none");
  const [direction, setDirection] = useState<"outbound" | "inbound">(
    "outbound",
  );
  const [purpose, setPurpose] = useState<keyof typeof purposes>("scheduling");
  const [outcome, setOutcome] = useState<keyof typeof outcomes>("connected");
  const [notes, setNotes] = useState("");
  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      const now = new Date();
      setId(crypto.randomUUID());
      setDate(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      );
      setTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      );
      setApplicationId(
        applications.some((app) => app.id === selectedApplicationId)
          ? selectedApplicationId!
          : applications.length === 1
            ? applications[0].id
            : "none",
      );
      setNotes("");
    }
    setOpen(next);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Phone className="size-4" />
          Log call
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a candidate call</DialogTitle>
          <DialogDescription>
            Document a scheduling call or follow-up. Times use your device&apos;s
            local time zone.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const occurred = new Date(`${date}T${time}`);
            if (Number.isNaN(occurred.getTime())) {
              toast.error("Choose a valid date and time.");
              return;
            }
            startTransition(async () => {
              const result = await logCandidateCall({
                id,
                candidateId,
                applicationId: applicationId === "none" ? null : applicationId,
                occurredAt: occurred.toISOString(),
                direction,
                purpose,
                outcome,
                notes,
              });
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              toast.success("Call logged.");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="space-y-2">
            <Label>Related application</Label>
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger
                className="w-full"
                aria-label="Related application"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  General candidate follow-up
                </SelectItem>
                {applications.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="call-date">Call date</Label>
              <DatePicker id="call-date" value={date} onChange={setDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="call-time">Time</Label>
              <Input
                id="call-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select
              value={direction}
              onValueChange={(value) => setDirection(value as typeof direction)}
            >
              <SelectTrigger className="w-full" aria-label="Call direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outbound">Outbound · we called</SelectItem>
                <SelectItem value="inbound">
                  Inbound · candidate called
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select
                value={purpose}
                onValueChange={(value) => setPurpose(value as typeof purpose)}
              >
                <SelectTrigger className="w-full" aria-label="Call purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(purposes).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select
                value={outcome}
                onValueChange={(value) => setOutcome(value as typeof outcome)}
              >
                <SelectTrigger className="w-full" aria-label="Call outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(outcomes).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="call-notes">Notes</Label>
            <Textarea
              id="call-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              required
              maxLength={10000}
              placeholder="What was discussed? Any agreed next steps?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !notes.trim()}>
              {pending ? "Saving…" : "Save call"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CallHistory({
  calls,
  applications,
}: {
  calls: CandidateCall[];
  applications: { id: string; title: string }[];
}) {
  if (!calls.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Call history</h3>
      {calls.map((call) => (
        <article
          key={call.id}
          className="space-y-2 rounded-xl border bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Phone className="size-4" />
              {purposes[call.purpose]} · {outcomes[call.outcome]}
            </span>
            <span className="text-xs text-muted-foreground"><ShortDateTime value={call.occurredAt} /></span>
          </div>
          <p className="text-xs text-muted-foreground">
            {call.direction === "outbound" ? "Outbound" : "Inbound"} · Logged by{" "}
            {call.authorName ?? "former workspace member"} ·{" "}
            {applications.find((app) => app.id === call.applicationId)?.title ??
              "General candidate follow-up"}
          </p>
          <p className="whitespace-pre-wrap text-sm">{call.notes}</p>
        </article>
      ))}
    </section>
  );
}
