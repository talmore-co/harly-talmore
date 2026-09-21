"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { BookingInvitationForm } from "./BookingInvitationForm";
import { getBulkBookingInvitationOptions } from "./booking-invitation-actions";

export function BulkBookingInvitationDrawer({
  applicationIds,
  disabled,
}: {
  applicationIds: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<string[]>([]);
  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (next) setSnapshot([...applicationIds]);
        setOpen(next);
      }}
      title="Send booking invitations"
      description="Invite selected candidates to choose an interview time."
      trigger={
        <Button
          size="sm"
          variant="outline"
          disabled={
            disabled || !applicationIds.length || applicationIds.length > 100
          }
          title={
            applicationIds.length > 100
              ? "Select up to 100 applications per batch"
              : undefined
          }
        >
          <CalendarPlus className="size-4" />
          Send booking invites
        </Button>
      }
      footer={
        <Button variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      }
    >
      {open && (
        <BulkBookingContent
          key={snapshot.join(",")}
          applicationIds={snapshot}
        />
      )}
    </SidePanel>
  );
}

function BulkBookingContent({ applicationIds }: { applicationIds: string[] }) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getBulkBookingInvitationOptions>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getBulkBookingInvitationOptions(applicationIds)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load these applications. Please try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [applicationIds, attempt]);
  if (!data)
    return (
      <div className="space-y-3"><p className="text-sm text-muted-foreground" role="status">
        {error ?? "Checking selected applications…"}
      </p>{error && <Button variant="outline" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Retry</Button>}</div>
    );
  const first = data.recipients.find((row) => row.eligible);
  if (!first || !data.options)
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">
          None of these applications can receive a new booking invitation.
        </p>
        {data.recipients.map((row) => (
          <p key={row.applicationId} className="text-sm">
            {row.name}
            {row.jobTitle ? ` · ${row.jobTitle}` : ""}
            <span className="block text-xs text-muted-foreground">
              {row.reason}
            </span>
          </p>
        ))}
      </div>
    );
  return (
    <BookingInvitationForm
      applicationId={first.applicationId}
      bulk={{ options: data.options, recipients: data.recipients }}
    />
  );
}
