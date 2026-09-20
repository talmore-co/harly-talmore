"use client";

import { useState, useTransition } from "react";
import { getCandidateMergeHistory } from "./duplicate-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CandidateMergeHistory({
  candidateId,
}: {
  candidateId: string;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof getCandidateMergeHistory>>
  >([]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(true);
          startTransition(async () => {
            try {
              setHistory(await getCandidateMergeHistory(candidateId));
            } catch {
              setError(true);
            }
          });
        }}
      >
        View merge history
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Candidate merge history</DialogTitle>
            <DialogDescription>
              Original profile and application values recorded at each merge.
              Related records remain linked to this profile.
            </DialogDescription>
          </DialogHeader>
          {pending ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : error ? (
            <p role="alert">Could not load merge history.</p>
          ) : history.length ? (
            history.map((entry) => (
              <details key={entry.id} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  Merged on {new Date(entry.createdAt).toLocaleString()}
                </summary>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(entry.snapshot, null, 2)}
                </pre>
              </details>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No candidate merges recorded.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
