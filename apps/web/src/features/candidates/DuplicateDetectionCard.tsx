"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";
import {
  detectCandidateDuplicatesAction,
  type DuplicateMatch,
} from "./ai-actions";
import {
  dismissCandidateDuplicate,
  getDuplicateReview,
  mergeCandidatesAction,
} from "./duplicate-actions";
import { mergeFields, type MergeField } from "./merge-fields";
import { AiButton } from "@/components/ui/AiButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Suspect = {
  candidateId: string;
  fullName: string;
  email: string;
  reasons?: string[];
};
type Review = Awaited<ReturnType<typeof getDuplicateReview>>;
const labels: Record<MergeField, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  location: "Location",
  linkedinUrl: "LinkedIn",
  githubUrl: "GitHub",
  websiteUrl: "Website",
  headline: "Headline",
  summary: "Summary",
  avatarUrl: "Photo URL",
  experienceYears: "Years of experience",
};

export function DuplicateDetectionCard({
  candidateId,
  suspects,
  aiConfigured,
}: {
  candidateId: string;
  suspects: Suspect[];
  aiConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(suspects[0]?.candidateId ?? "");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = suspects.filter(
    (item) => !dismissed.includes(item.candidateId),
  );
  const active =
    visible.find((item) => item.candidateId === selected) ?? visible[0];
  if (!visible.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-clay/20 bg-clay/5 p-4">
      <p className="flex items-center gap-2 text-sm text-clay">
        <AlertTriangle className="size-4" />
        Possible duplicate candidate records found.
      </p>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Review possible duplicates
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl [&>*]:min-w-0 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:min-w-0 [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:truncate">
          <DialogHeader>
            <DialogTitle>Review possible duplicates</DialogTitle>
            <DialogDescription>
              Compare evidence, choose the profile to keep, and review any
              shared applications before merging.
            </DialogDescription>
          </DialogHeader>
          <Select value={active?.candidateId} onValueChange={setSelected}>
            <SelectTrigger aria-label="Candidate to compare">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visible.map((item) => (
                <SelectItem key={item.candidateId} value={item.candidateId}>
                  {item.fullName} · {item.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {active ? (
            <ReviewPair
              key={active.candidateId}
              candidateId={candidateId}
              suspect={active}
              aiConfigured={aiConfigured}
              onDismiss={() => {
                setDismissed((ids) => [...ids, active.candidateId]);
                if (visible.length === 1) setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewPair({
  candidateId,
  suspect,
  aiConfigured,
  onDismiss,
}: {
  candidateId: string;
  suspect: Suspect;
  aiConfigured: boolean;
  onDismiss: () => void;
}) {
  const [primaryId, setPrimaryId] = useState(candidateId);
  const sourceId =
    primaryId === candidateId ? suspect.candidateId : candidateId;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Evidence: {suspect.reasons?.join(" · ") || "Matching candidate details"}
      </p>
      <Select value={primaryId} onValueChange={setPrimaryId}>
        <SelectTrigger aria-label="Primary candidate profile">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={candidateId}>Keep the profile I opened</SelectItem>
          <SelectItem value={suspect.candidateId}>
            Keep the other profile for {suspect.fullName}
          </SelectItem>
        </SelectContent>
      </Select>
      <MergeReview
        key={primaryId}
        primaryId={primaryId}
        sourceId={sourceId}
        aiConfigured={aiConfigured}
        onDismiss={onDismiss}
      />
    </div>
  );
}

function MergeReview({
  primaryId,
  sourceId,
  aiConfigured,
  onDismiss,
}: {
  primaryId: string;
  sourceId: string;
  aiConfigured: boolean;
  onDismiss: () => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<
    Partial<Record<MergeField, "primary" | "source">>
  >({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [assessment, setAssessment] = useState<DuplicateMatch[] | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    getDuplicateReview(primaryId, sourceId)
      .then((result) => {
        if (!cancelled) setReview(result);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Could not load this comparison. Check access and try again.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [primaryId, sourceId]);
  if (!review)
    return (
      <p
        className="text-sm text-muted-foreground"
        role={error ? "alert" : undefined}
      >
        {error ?? "Loading comparison…"}
      </p>
    );
  const [primary, source] = review.people;
  const sharedJobs = [
    ...new Set(review.applications.map((row) => row.application.jobId)),
  ]
    .map((jobId) => ({
      jobId,
      rows: review.applications
        .filter((row) => row.application.jobId === jobId)
        .sort(
          (a, b) =>
            Number(b.application.candidateId === primaryId) -
            Number(a.application.candidateId === primaryId),
        ),
    }))
    .filter((group) => group.rows.length > 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[primary, source].map((person, index) => (
          <div key={person.id} className="rounded-lg border p-3 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">
              {index === 0 ? "Primary profile" : "Profile being merged"}
            </p>
            <p className="font-medium">
              {person.firstName} {person.lastName}
            </p>
            <p className="break-all">{person.email}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
              {person.headline || "No headline"}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer">
                Skills, experience and education
              </summary>
              <div className="mt-2 space-y-3 break-words text-sm">
                <p>
                  {Array.isArray(person.skills) && person.skills.length
                    ? person.skills.map(String).join(", ")
                    : "No skills recorded"}
                </p>
                {person.experienceEntries.map((entry, index) => (
                  <div key={index}>
                    <p className="font-medium">
                      {entry.title} · {entry.company}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.startDate ?? "Unknown start"} to{" "}
                      {entry.current
                        ? "Present"
                        : (entry.endDate ?? "Unknown end")}
                    </p>
                    {entry.description ? (
                      <p className="whitespace-pre-wrap">{entry.description}</p>
                    ) : null}
                  </div>
                ))}
                {person.educationEntries.map((entry, index) => (
                  <div key={index}>
                    <p className="font-medium">{entry.school}</p>
                    <p>
                      {[entry.degree, entry.field].filter(Boolean).join(" · ")}
                    </p>
                    {entry.description ? (
                      <p className="whitespace-pre-wrap">{entry.description}</p>
                    ) : null}
                  </div>
                ))}
                {!person.experienceEntries.length &&
                !person.educationEntries.length ? (
                  <p className="text-muted-foreground">
                    No experience or education recorded
                  </p>
                ) : null}
              </div>
            </details>
            <p className="text-muted-foreground">
              {
                review.applications.filter(
                  (row) => row.application.candidateId === person.id,
                ).length
              }{" "}
              {review.applications.filter(
                (row) => row.application.candidateId === person.id,
              ).length === 1
                ? "application"
                : "applications"}
            </p>
          </div>
        ))}
      </div>
      {aiConfigured ? (
        <div className="space-y-2">
          <AiButton
            size="sm"
            variant="outline"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await detectCandidateDuplicatesAction({
                  candidateId: primaryId,
                  otherCandidateId: sourceId,
                });
                if (result.ok)
                  setAssessment(
                    result.matches.filter(
                      (match) => match.candidateId === sourceId,
                    ),
                  );
                else toast.error(result.error);
              })
            }
          >
            Ask AI for an assessment
          </AiButton>
          <p className="text-xs text-muted-foreground">
            AI compares names, emails, headlines and skills. You decide whether
            to merge.
          </p>
          {assessment ? (
            <p className="text-sm">
              {assessment.length
                ? `${assessment[0].confidence === "high" ? "Likely duplicate" : "Possible match"}: ${assessment[0].reason}`
                : "AI did not identify this pair as a likely duplicate. Review the evidence yourself."}
            </p>
          ) : null}
        </div>
      ) : null}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Profile fields to retain</h3>
        <p className="text-xs text-muted-foreground">
          Empty primary fields are filled from the other profile. Skills,
          education and experience entries are combined.
        </p>
        {mergeFields
          .filter((key) => primary[key] !== source[key])
          .map((key) => (
            <div key={key} className="space-y-2 border-b py-2">
              <span className="text-sm">{labels[key]}</span>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2">
                  <span className="block text-xs text-muted-foreground">
                    Primary
                  </span>
                  {String(primary[key] ?? "Empty")}
                </p>
                <p className="whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2">
                  <span className="block text-xs text-muted-foreground">
                    Other
                  </span>
                  {String(source[key] ?? "Empty")}
                </p>
              </div>
              <Select
                disabled={!review.canMerge || pending}
                value={
                  fields[key] ?? (primary[key] == null ? "source" : "primary")
                }
                onValueChange={(value) =>
                  setFields((current) => ({
                    ...current,
                    [key]: value as "primary" | "source",
                  }))
                }
              >
                <SelectTrigger
                  aria-label={`Keep ${labels[key]}`}
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Keep primary value</SelectItem>
                  <SelectItem value="source">Use other value</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
      </section>
      {sharedJobs.length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">
            Applications for the same job
          </h3>
          <p className="text-xs text-muted-foreground">
            Select the application whose stage, outcome, scores and answers
            should stay current. Related notes, files, interviews, offers and
            tasks are combined. Original values remain in the merge audit.
          </p>
          {sharedJobs.map(({ jobId, rows }) => (
            <div key={jobId} className="space-y-2">
              <p className="text-sm font-medium">{rows[0].jobTitle}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map(({ application, stageName }) => (
                  <div
                    key={application.id}
                    className="min-w-0 rounded-lg border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {application.candidateId === primaryId
                        ? "Primary application"
                        : "Other application"}
                    </p>
                    <p>
                      {stageName} · {application.status}
                    </p>
                    <p>
                      Questionnaire:{" "}
                      {application.questionnaireScore ?? "Not scored"}
                    </p>
                    <p>
                      AI fit:{" "}
                      {review.evaluations.find(
                        (evaluation) =>
                          evaluation.applicationId === application.id,
                      )?.score ?? "Not scored"}
                    </p>
                    <p>Hire date: {application.hiredOn ?? "Not recorded"}</p>
                    {application.hireTerms ? (
                      <p className="whitespace-pre-wrap break-words">
                        {application.hireTerms}
                      </p>
                    ) : null}
                    <details className="mt-2">
                      <summary className="cursor-pointer">
                        Submitted answers
                      </summary>
                      {review.answers
                        .filter(
                          (answer) => answer.applicationId === application.id,
                        )
                        .map((answer, index) => (
                          <div key={index} className="mt-2">
                            <p className="text-xs text-muted-foreground">
                              {answer.question}
                            </p>
                            <p className="whitespace-pre-wrap break-words">
                              {answer.answer}
                            </p>
                          </div>
                        ))}
                    </details>
                  </div>
                ))}
              </div>
              <Select
                value={choices[jobId] ?? ""}
                onValueChange={(value) =>
                  setChoices((current) => ({ ...current, [jobId]: value }))
                }
              >
                <SelectTrigger
                  aria-label={`Application to retain for ${rows[0].jobTitle}`}
                >
                  <SelectValue placeholder="Choose the application to retain" />
                </SelectTrigger>
                <SelectContent>
                  {rows.map(({ application, stageName }) => (
                    <SelectItem key={application.id} value={application.id}>
                      {application.candidateId === primaryId
                        ? "Primary"
                        : "Other"}{" "}
                      · {stageName} · {application.status} · applied{" "}
                      {new Date(application.appliedAt)
                        .toISOString()
                        .slice(0, 10)}{" "}
                      · questionnaire{" "}
                      {application.questionnaireScore ?? "not scored"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The other profile will redirect to the primary profile. Existing
        candidate portal sessions are signed out. This does not send emails or
        change application stages. Original records are retained in the merge
        audit.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {review.canMerge ? (
        <>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            I reviewed the profiles and application choices. These records
            belong to the same person.
          </label>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await dismissCandidateDuplicate(primaryId, sourceId);
                    toast.success("Marked as different people");
                    onDismiss();
                    router.refresh();
                  } catch {
                    toast.error("Could not save this decision.");
                  }
                })
              }
            >
              Different people · dismiss
            </Button>
            <Button
              disabled={
                pending ||
                !confirmed ||
                sharedJobs.some(({ jobId }) => !choices[jobId])
              }
              onClick={() =>
                startTransition(async () => {
                  const result = await mergeCandidatesAction({
                    primaryId,
                    sourceId,
                    revision: review.revision,
                    fields,
                    applicationChoices: choices,
                  });
                  if (!result.ok) setError(result.error);
                  else {
                    toast.success("Candidate records merged");
                    router.push(`/dashboard/candidates/${result.candidateId}`);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Saving…" : "Merge into primary profile"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Merging or dismissing requires candidate edit and delete permissions.
        </p>
      )}
    </div>
  );
}
