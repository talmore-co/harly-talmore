"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/notification-island/toast";
import { addCandidateToPipeline } from "./pipeline-actions";

export function AddToPipelineDialog({
  candidateId,
  jobs,
}: {
  candidateId: string;
  jobs: Array<{ id: string; title: string; referred: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const selected = jobs.find((job) => job.id === jobId);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        setError("");
        if (value)
          setJobId(jobs.find((job) => job.referred)?.id ?? jobs[0]?.id ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Add to pipeline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to pipeline</DialogTitle>
          <DialogDescription>
            Create an application in the first stage of an open job.
          </DialogDescription>
        </DialogHeader>
        {jobs.length ? (
          <div className="space-y-3">
            <Label htmlFor="pipeline-job">Job</Label>
            <select
              id="pipeline-job"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              disabled={pending}
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                  {job.referred ? " · Referred" : ""}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              {selected?.referred
                ? "Application source: Referral. The existing referrer and referral notes are retained."
                : "Application source: Manual."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No eligible open jobs. The candidate may already have an application
            for each available job.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !selected}
            onClick={() =>
              start(async () => {
                setError("");
                const result = await addCandidateToPipeline({
                  candidateId,
                  jobId,
                });
                if (!result.success) {
                  setError(result.error ?? "Could not add candidate.");
                  return;
                }
                toast.success("Candidate added to pipeline");
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "Adding…" : "Add to pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
