"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** null cancels; false rejects silently; true explicitly requests an email. */
export function useRejectionConfirmation() {
  const [count, setCount] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const resolver = useRef<((choice: boolean | null) => void) | null>(null);

  useEffect(() => () => { resolver.current?.(null); }, []);

  function finish(choice: boolean | null) {
    resolver.current?.(choice);
    resolver.current = null;
    setCount(null);
  }

  function confirmRejection(applicationCount: number): Promise<boolean | null> {
    if (resolver.current) return Promise.resolve(null);
    setSendEmail(false);
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
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={sendEmail} onCheckedChange={value => setSendEmail(value === true)} />
          <span>Send rejection email<span className="mt-1 block text-xs text-muted-foreground">Uses the workspace&apos;s active Rejection template, or the built-in message. Only newly rejected applications receive an email.</span></span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => finish(sendEmail)}>{sendEmail ? "Reject and send email" : "Reject without email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { confirmRejection, rejectionDialog };
}
