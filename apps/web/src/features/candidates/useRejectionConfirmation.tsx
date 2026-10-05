"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REJECTION_NOTE_MAX_LENGTH, REJECTION_REASONS, isRejectionReasonCode, type RejectionReasonCode } from "@/features/pipeline/rejection-reasons";

export type RejectionChoice = {
  /** false rejects silently; true explicitly requests an email. */
  sendEmail: boolean;
  /** Internal only. Never shown or sent to the candidate. */
  reason: RejectionReasonCode | null;
  note: string | null;
};

const NO_REASON = "none";

/** null cancels; otherwise the email choice plus the optional internal reason. */
export function useRejectionConfirmation() {
  const [count, setCount] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [reason, setReason] = useState<RejectionReasonCode | null>(null);
  const [note, setNote] = useState("");
  const resolver = useRef<((choice: RejectionChoice | null) => void) | null>(null);

  useEffect(() => () => { resolver.current?.(null); }, []);

  function finish(choice: RejectionChoice | null) {
    resolver.current?.(choice);
    resolver.current = null;
    setCount(null);
  }

  function confirmRejection(applicationCount: number): Promise<RejectionChoice | null> {
    if (resolver.current) return Promise.resolve(null);
    setSendEmail(false);
    setReason(null);
    setNote("");
    setCount(applicationCount);
    return new Promise(resolve => { resolver.current = resolve; });
  }

  const rejectionDialog = (
    <Dialog open={count !== null} onOpenChange={open => { if (!open) finish(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {count === 1 ? "application" : `${count} applications`}?</DialogTitle>
          <DialogDescription>This updates the application status. No email is sent unless you select the option below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rejection-reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Select value={reason ?? NO_REASON} onValueChange={value => setReason(isRejectionReasonCode(value) ? value : null)}>
            <SelectTrigger id="rejection-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REASON}>No reason recorded</SelectItem>
              {REJECTION_REASONS.map(option => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rejection-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="rejection-note" value={note} onChange={event => setNote(event.target.value)} maxLength={REJECTION_NOTE_MAX_LENGTH} rows={2} placeholder={count === 1 ? "Context for your team" : "Context for your team, saved on every selected application"} />
          <p className="text-xs text-muted-foreground">Reason and note are internal. Candidates never see them.</p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={sendEmail} onCheckedChange={value => setSendEmail(value === true)} />
          <span>Send rejection email<span className="mt-1 block text-xs text-muted-foreground">Uses the workspace&apos;s active Rejection template, or the built-in message. Only newly rejected applications receive an email.</span></span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => finish({ sendEmail, reason, note: note.trim() || null })}>{sendEmail ? "Reject and send email" : "Reject without email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { confirmRejection, rejectionDialog };
}
