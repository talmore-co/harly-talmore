"use client";
import { ScorecardFields } from "./ScorecardFields";
import { RatingChoices } from "./RatingChoices";
import type { ScorecardSubmission } from "./scorecard-definition";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBrowserTimeZone } from "@/features/interviews/shared";
import { recordInterview } from "@/features/interviews/record-actions";
import { toast } from "@/lib/notification-island/toast";
import type {
  ScheduleApplicationOption,
  ScheduleMemberOption,
} from "./ScheduleDialog";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function RecordInterviewDialog({
  candidateId,
  applications,
  members,
  currentUserId,
}: {
  candidateId: string;
  applications: ScheduleApplicationOption[];
  members: ScheduleMemberOption[];
  currentUserId?: string;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const [open, setOpen] = useState(false),
    [pending, startTransition] = useTransition();
  const [id, setId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [type, setType] = useState("screening"),
    [mode, setMode] = useState("phone");
  const [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [zone, setZone] = useState("UTC");
  const [duration, setDuration] = useState("30"),
    [interviewer, setInterviewer] = useState("");
  const [notes, setNotes] = useState(""),
    [rating, setRating] = useState("none"),
    [assessment, setAssessment] = useState("");
  const [scorecard, setScorecard] = useState<ScorecardSubmission>();
  function changeOpen(value: boolean) {
    if (pending) return;
    if (value) {
      setId(crypto.randomUUID());
      const selected = params.get("applicationId");
      setApplicationId(
        applications.find((app) => app.applicationId === selected)
          ?.applicationId ??
          applications[0]?.applicationId ??
          "",
      );
      const now = new Date();
      setDate(today());
      setTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      );
      setZone(getBrowserTimeZone());
      setInterviewer(
        members.some((member) => member.userId === currentUserId)
          ? currentUserId!
          : "",
      );
      setType("screening");
      setMode("phone");
      setDuration("30");
      setNotes("");
      setRating("none");
      setScorecard(undefined);
      setAssessment("");
    }
    setOpen(value);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!applications.length}>
          <ClipboardCheck className="size-4" />
          Record interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record interview</DialogTitle>
          <DialogDescription>
            Document an interview that already happened. Notes and assessments
            are internal. No invitation or calendar event is created.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await recordInterview({
                id,
                candidateId,
                applicationId,
                type,
                mode,
                scheduledAt: `${date}T${time}`,
                timeZone: zone,
                durationMins: Number(duration),
                interviewerId: interviewer,
                internalNotes: notes,
                rating: rating === "none" ? null : rating,
                assessment: rating === "none" ? "" : assessment,
                scorecard: rating === "none" ? undefined : scorecard,
              });
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              toast.success("Interview recorded");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="record-application">Application</Label>
            <Select
              value={applicationId}
              onValueChange={(value) => { setApplicationId(value); setScorecard(undefined); setRating("none"); setAssessment(""); }}
              disabled={pending}
            >
              <SelectTrigger id="record-application" className="w-full">
                <SelectValue placeholder="Choose application" />
              </SelectTrigger>
              <SelectContent>
                {applications.map((app) => (
                  <SelectItem key={app.applicationId} value={app.applicationId}>
                    {app.jobTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="record-type">Interview type</Label>
              <Select value={type} onValueChange={setType} disabled={pending}>
                <SelectTrigger id="record-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    ["screening", "Screening"],
                    ["technical", "Technical"],
                    ["culture_fit", "Culture fit"],
                    ["onsite", "Onsite"],
                    ["final", "Final round"],
                  ].map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-mode">Method</Label>
              <Select value={mode} onValueChange={setMode} disabled={pending}>
                <SelectTrigger id="record-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-date">Date</Label>
              <DatePicker
                id="record-date"
                value={date}
                onChange={setDate}
                max={today()}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-time">Time</Label>
              <Input
                id="record-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
                disabled={pending}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Time zone: {zone}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="record-duration">Duration in minutes</Label>
              <Input
                id="record-duration"
                type="number"
                min={1}
                max={1440}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-interviewer">Interviewer</Label>
              <Select
                value={interviewer}
                onValueChange={setInterviewer}
                disabled={pending}
              >
                <SelectTrigger id="record-interviewer" className="w-full">
                  <SelectValue placeholder="Choose interviewer" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="record-notes">Internal interview notes</Label>
            <Textarea
              id="record-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={20000}
              rows={5}
              disabled={pending}
              placeholder="What you discussed, observations and next steps"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Overall recommendation (optional)</p>
            <RatingChoices type="recommendation" value={rating === "none" ? null : rating} onChange={(value) => setRating(value === null ? "none" : String(value))} label="Overall recommendation" disabled={pending} />
          </div>
          {rating !== "none" && open ? <ScorecardFields key={applicationId} applicationId={applicationId} candidateId={candidateId} value={scorecard} onChange={setScorecard} disabled={pending} /> : null}
          {rating !== "none" ? (
            <div className="space-y-2">
              <Label htmlFor="record-assessment">Assessment comments</Label>
              <Textarea
                id="record-assessment"
                value={assessment}
                onChange={(event) => setAssessment(event.target.value)}
                maxLength={5000}
                rows={3}
                disabled={pending}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !applicationId || !interviewer || (rating !== "none" && !scorecard)}
            >
              {pending ? "Saving…" : "Save completed interview"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
