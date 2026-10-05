"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/notification-island/toast";
import { updateCandidateContactRestrictions } from "./contact-restriction-actions";

export type ContactRestrictionValues = {
  emailOptedOut: boolean;
  offLimits: boolean;
  /** Date-only, YYYY-MM-DD. */
  offLimitsUntil: string | null;
  reason: string;
};

export function ContactRestrictionsDialog({
  candidateId,
  name,
  initial,
  trigger,
}: {
  candidateId: string;
  name: string;
  initial: ContactRestrictionValues;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateCandidateContactRestrictions({ candidateId, ...values }).catch(() => null);
      if (!result?.success) {
        toast.error(result?.error ?? "Could not update contact restrictions.");
        return;
      }
      toast.success(values.emailOptedOut || values.offLimits ? "Contact restrictions saved." : "Contact restrictions removed.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setValues(initial); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact restrictions</DialogTitle>
          <DialogDescription>Control whether {name} can be contacted. Sign-in links and verification codes are always delivered.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="restriction-opt-out">Email opt-out</Label>
              <p className="text-sm text-muted-foreground">Blocks recruiter and automated emails. Interviews can still be scheduled.</p>
            </div>
            <Switch id="restriction-opt-out" checked={values.emailOptedOut} disabled={isPending} onCheckedChange={(checked) => setValues({ ...values, emailOptedOut: checked })} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="restriction-off-limits">Off limits</Label>
              <p className="text-sm text-muted-foreground">Blocks all outbound contact, including scheduling and booking links.</p>
            </div>
            <Switch id="restriction-off-limits" checked={values.offLimits} disabled={isPending} onCheckedChange={(checked) => setValues({ ...values, offLimits: checked })} />
          </div>
          {values.offLimits && (
            <div className="space-y-2">
              <Label htmlFor="restriction-until">Off limits until (optional)</Label>
              <DatePicker id="restriction-until" value={values.offLimitsUntil ?? ""} disabled={isPending} onChange={(value) => setValues({ ...values, offLimitsUntil: value || null })} />
            </div>
          )}
          {(values.emailOptedOut || values.offLimits) && (
            <div className="space-y-2">
              <Label htmlFor="restriction-reason">Reason (optional)</Label>
              <Textarea id="restriction-reason" value={values.reason} maxLength={500} disabled={isPending} onChange={(event) => setValues({ ...values, reason: event.target.value })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={isPending} onClick={save}>{isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
