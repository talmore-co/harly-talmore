"use client";
import { ScorecardFields } from "./ScorecardFields";
import type { ScorecardSubmission } from "./scorecard-definition";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RatingChoices } from "./RatingChoices";
import { toast } from "@/lib/notification-island/toast";

import {
  createScorecard,
  refineScorecardTextAction,
} from "@/features/candidates/actions";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MagicWandDuotoneIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

type RatingKey = "strong" | "mixed" | "weak";

export function EvaluationDrawer({
  candidateId,
  workspaceId,
  applicationId,
  interviewId,
  stageId,
  stageName,
  jobTitle,
  clientName,
  applications,
  trigger,
}: {
  candidateId: string;
  workspaceId: string;
  applicationId: string;
  interviewId?: string;
  stageId?: string | null;
  stageName: string | null;
  jobTitle: string;
  clientName?: string | null;
  applications?: Array<{ applicationId: string; jobTitle: string; clientName?: string | null; currentStageName: string | null }>;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scorecard, setScorecard] = useState<ScorecardSubmission>();
  const [chosenApplicationId, setChosenApplicationId] = useState(applicationId);
  const options = applications?.length ? applications : [{ applicationId, jobTitle, clientName, currentStageName: stageName }];
  const selected = options.find((option) => option.applicationId === chosenApplicationId) ?? options[0];
  const [rating, setRating] = useState<RatingKey | null>(null);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  const [refining, startRefine] = useTransition();

  function refine() {
    if (!comment.trim()) {
      toast.error("Write a comment to refine first.");
      return;
    }
    startRefine(async () => {
      const result = await refineScorecardTextAction({ comment, candidateId, applicationId: selected.applicationId });
      if (!result.ok) {
        toast.error(result.error ?? "Could not refine.");
        return;
      }
      setComment(result.refined);
      toast.success("Comment refined");
    });
  }

  function submit() {
    if (!rating) {
      toast.error("Pick an overall rating first.");
      return;
    }
    startTransition(async () => {
      const result = await createScorecard({
        interviewId,
        scorecard,
        candidateId,
        workspaceId,
        applicationId: selected.applicationId,
        stageId: selected.applicationId === applicationId ? stageId : undefined,
        rating,
        comment: comment.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save the evaluation.");
        return;
      }
      toast.success("Evaluation saved");
      setOpen(false);
      setRating(null);
      setComment("");
      router.refresh();
    });
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(value) => {
        if (isPending) return;
        if (value) {
          setChosenApplicationId(applicationId);
          setScorecard(undefined);
          setRating(null); setComment("");
        }
        setOpen(value);
      }}
      trigger={trigger}
      title={`Fill out scorecard${selected.currentStageName ? ` · ${selected.currentStageName}` : ""}`}
      description="Assess this candidate for the selected application."
      footer={
        <>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || !scorecard}>
            {isPending ? "Saving…" : "Save scorecard"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="assessment-application">Application</Label>
          <Select value={selected.applicationId} disabled={isPending || refining || Boolean(interviewId) || options.length === 1} onValueChange={(value) => {
            setChosenApplicationId(value); setScorecard(undefined); setRating(null); setComment("");
          }}>
            <SelectTrigger id="assessment-application" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((option) => <SelectItem key={option.applicationId} value={option.applicationId}>{option.clientName ? `${option.clientName} · ` : ""}{option.jobTitle}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{interviewId ? "This assessment belongs to the interview’s application." : "Changing applications clears the draft assessment."}</p>
        </div>
        {open ? <ScorecardFields key={selected.applicationId} applicationId={selected.applicationId} candidateId={candidateId} value={scorecard} onChange={setScorecard} disabled={isPending} /> : null}
        <div className="space-y-2">
          <p className="text-[13px] font-medium tracking-tight text-foreground/90">
            Overall recommendation
          </p>
          <RatingChoices type="recommendation" value={rating} onChange={(value) => setRating(value as RatingKey)} label="Overall recommendation" disabled={isPending} clearable={false} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="evaluation-comment"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Comments
            </label>
          </div>

          <div className="relative">
            <Textarea
              id="evaluation-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Strengths, concerns, and your recommendation…"
              className="min-h-32 pb-11"
            />
            <button
              type="button"
              onClick={refine}
              disabled={refining || !comment.trim()}
              className={cn(
                "absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5",
                "text-xs font-medium text-foreground/80 shadow-sm transition-[transform,background-color,color]",
                "duration-150 ease-out hover:bg-muted active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {refining ? (
                <SpinnerIcon className="size-3.5 animate-spin" />
              ) : (
                <MagicWandDuotoneIcon className="size-3.5" />
              )}
              {refining ? "Refining…" : "Refine with AI"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            AI cleans up grammar and clarity without changing your judgement.
          </p>
        </div>
      </div>
    </SidePanel>
  );
}
