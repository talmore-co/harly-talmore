"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/notification-island/toast";
import { BOOKING_INVITATION_MESSAGE } from "@/features/automations/builder/message-defaults";
import {
  createManualBookingInvitation,
  getBookingInvitationOptions,
  previewBookingInvitationPool,
  sendBulkBookingInvitationAction,
  getBulkBookingInvitationOptions,
} from "./booking-invitation-actions";
import type { BulkBookingResult } from "./bulk-booking-invitations";

type Options = Awaited<ReturnType<typeof getBookingInvitationOptions>>;
type InterviewType =
  | "screening"
  | "technical"
  | "culture_fit"
  | "onsite"
  | "final";
const formatLabel = (format: string | null) =>
  format?.startsWith("address:")
    ? `In person · ${format.slice(8)}`
    : format === "phone"
      ? "Phone"
      : "Video";

export function BookingInvitationForm({
  applicationId,
  bulk,
}: {
  applicationId: string;
  bulk?: {
    options: Options;
    recipients: Awaited<
      ReturnType<typeof getBulkBookingInvitationOptions>
    >["recipients"];
  };
}) {
  const router = useRouter();
  const [data, setData] = useState<Options | null>(bulk?.options ?? null);
  const [error, setError] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>(
    bulk?.options.members
      .filter((m) => m.userId === bulk.options.currentUserId && m.ready)
      .map((m) => m.userId) ?? [],
  );
  const [type, setType] = useState<InterviewType>("screening");
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(BOOKING_INVITATION_MESSAGE.subject);
  const [body, setBody] = useState(BOOKING_INVITATION_MESSAGE.body);
  const [showMessage, setShowMessage] = useState(Boolean(bulk));
  const [bulkResults, setBulkResults] = useState<BulkBookingResult[] | null>(
    null,
  );
  const batchLocked = Boolean(bulkResults?.some((row) => row.status === "queued"));
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [checkedPool, setCheckedPool] = useState<{
    key: string;
    result: Awaited<ReturnType<typeof previewBookingInvitationPool>>;
  } | null>(null);
  const requestId = useRef<string | null>(null);
  const saved = bulk ? null : data?.invitation;
  const locked = Boolean(saved && saved.state !== "open");
  const reuse = Boolean(saved && !editing);

  useEffect(() => {
    if (bulk) return;
    let active = true;
    getBookingInvitationOptions(applicationId)
      .then((result) => {
        if (!active) return;
        setData(result);
        setIds(
          result.invitation?.interviewerIds ??
            result.members
              .filter((m) => m.userId === result.currentUserId && m.ready)
              .map((m) => m.userId),
        );
        setType(result.invitation?.interviewType ?? "screening");
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load booking options. Close and reopen scheduling to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [applicationId, bulk]);

  const selectionKey = ids.join(",");
  const preview = checkedPool?.key === selectionKey ? checkedPool.result : null;
  const validating = !reuse && ids.length > 0 && !preview;
  useEffect(() => {
    if (reuse || !selectionKey) return;
    let active = true;
    previewBookingInvitationPool(applicationId, selectionKey.split(","))
      .then((result) => {
        if (active) setCheckedPool({ key: selectionKey, result });
      })
      .catch(() => {
        if (active)
          setCheckedPool({
            key: selectionKey,
            result: {
              ok: false,
              error:
                "Could not check Cal.com settings. Try selecting the interviewers again.",
            },
          });
      });
    return () => {
      active = false;
    };
  }, [applicationId, selectionKey, reuse]);

  function submit(delivery: "copy" | "email") {
    setError(null);
    requestId.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        if (bulk) {
          const result = await sendBulkBookingInvitationAction({
            applicationIds: bulk.recipients.filter((row) => row.eligible).map((row) => row.applicationId),
            interviewerIds: ids,
            interviewType: type,
            requestId: requestId.current,
            subject,
            body,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBulkResults(result.results);
          toast.success(
            `${result.results.filter((row) => row.status === "queued").length} booking invitations queued.`,
          );
          router.refresh();
          return;
        }
        const result = await createManualBookingInvitation({
          applicationId,
          interviewerIds: ids,
          interviewType: type,
          operation: saved ? (editing ? "update" : "reuse") : "create",
          expectedUpdatedAt: saved?.updatedAt,
          delivery,
          requestId: requestId.current,
          subject,
          body,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.url) {
          setLink(result.url);
          try {
            await navigator.clipboard.writeText(result.url);
            toast.success("Booking link copied. Share it with the candidate.");
          } catch {
            toast.info("Select and copy the booking link below.");
          }
        } else {
          toast.success("Booking invitation queued for delivery.");
          setShowMessage(false);
        }
        const refreshed = await getBookingInvitationOptions(applicationId);
        setData(refreshed);
        setEditing(false);
        requestId.current = null;
        router.refresh();
      } catch {
        setError("Could not create the invitation. Please try again.");
      }
    });
  }

  if (!data)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {error ?? "Loading booking options…"}
      </p>
    );
  const canSubmit =
    data.canInvite &&
    !pending &&
    !locked &&
    ids.length > 0 &&
    (reuse ? saved?.available : !validating && preview?.ok);
  return (
    <div className="space-y-5">
      {bulk && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {bulk.recipients.filter((row) => row.eligible).length} of{" "}
            {bulk.recipients.length} applications ready to invite
          </p>
          <p className="text-xs text-muted-foreground">
            Each application gets its own personal booking link and email.
            Existing invitations are kept and can be managed individually.
          </p>
          <ul className="max-h-44 space-y-2 overflow-y-auto rounded-xl border p-3">
            {bulk.recipients.map((row) => {
              const result = bulkResults?.find(
                (item) => item.applicationId === row.applicationId,
              );
              return (
                <li key={row.applicationId} className="text-sm">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.jobTitle}
                  </p>
                  <p
                    className={`text-xs ${result?.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {result?.reason ?? row.reason}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!data.canInvite && (
        <p className="text-sm text-muted-foreground">
          Self-booking needs an active application on an open job without an
          existing interview. Manage existing interviews in the Interviews tab.
        </p>
      )}
      {saved && (
        <div className="space-y-2 rounded-xl border bg-accent/40 p-3.5">
          <p className="text-sm font-medium">
            {saved.state === "open"
              ? "Awaiting candidate booking"
              : saved.state === "confirmed"
                ? "Interview booked"
                : saved.state === "canceled"
                  ? "Booking canceled"
                  : "Booking confirmation in progress"}
          </p>
          <p className="text-xs text-muted-foreground">
            {saved.source === "automation"
              ? "This application already has an automation booking invitation."
              : "This application already has a personal Talmore booking link."}{" "}
            {locked
              ? "Manage the booked interview or resolve the pending booking before creating another invitation."
              : "Reuse the existing link or explicitly update its interviewers."}
          </p>
          {!saved.available && !locked && (
            <p className="text-xs text-muted-foreground">
              The invitation is paused or unavailable. Update it to manage it
              manually.
            </p>
          )}
          {!locked && !editing && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setEditing(true);
                setLink(null);
              }}
            >
              Update eligible interviewers
            </Button>
          )}
          {editing && (
            <p className="text-xs text-muted-foreground">
              Saving keeps the same link and makes this a manual invitation.
              Future workflow edits will no longer change it.
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="booking-type">Interview type</Label>
        <Select
          value={type}
          onValueChange={(value) => setType(value as InterviewType)}
          disabled={reuse || pending || batchLocked}
        >
          <SelectTrigger id="booking-type" className="w-full">
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
              <SelectItem key={value} value={value!}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Eligible interviewers</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={reuse || pending || batchLocked}
              aria-label="Choose eligible interviewers"
            >
              {ids.length
                ? `${ids.length} interviewer${ids.length > 1 ? "s" : ""} selected`
                : "Choose interviewers"}
              <ChevronsUpDown className="size-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search interviewers…" />
              <CommandList>
                <CommandEmpty>No interviewers found.</CommandEmpty>
                <CommandGroup>
                  {data.members.map((m) => (
                    <CommandItem
                      key={m.userId}
                      value={`${m.name} ${m.userId}`}
                      disabled={
                        !m.ready ||
                        (!ids.includes(m.userId) && ids.length >= 10)
                      }
                      onSelect={() => {
                        setIds((current) =>
                          current.includes(m.userId)
                            ? current.filter((id) => id !== m.userId)
                            : [...current, m.userId],
                        );
                        setLink(null);
                      }}
                    >
                      <Check
                        className={`size-4 ${ids.includes(m.userId) ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>
                        {m.name}
                        <span className="block text-xs text-muted-foreground">
                          {m.ready
                            ? `${m.durationMins} min · ${m.title}`
                            : "Set up Cal.com in Account → Connections"}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {ids.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {ids
              .map(
                (id) =>
                  data.members.find((m) => m.userId === id)?.name ??
                  "Unavailable member",
              )
              .join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The candidate can choose a time when any selected interviewer is
          available. One interviewer will be assigned automatically.
        </p>
      </div>
      {reuse && saved ? (
        <p className="text-sm">
          {saved.durationMins} minutes · {formatLabel(saved.locationFormat)}
        </p>
      ) : (
        ids.length > 0 && (
          <div className="text-sm" role="status">
            {validating ? (
              "Checking duration and meeting format…"
            ) : preview?.ok ? (
              `${preview.durationMins} minutes · ${formatLabel(preview.locationFormat)}`
            ) : (
              <p className="text-destructive">{preview?.error}</p>
            )}
          </div>
        )
      )}
      {!data.members.some((m) => m.ready) && (
        <p className="text-sm text-muted-foreground">
          Connect a personal Cal.com account and configure booking sync in
          Account → Connections to enable self-booking.
        </p>
      )}
      {showMessage && (
        <div className="space-y-4 rounded-xl border p-3.5">
          <div className="space-y-2">
            <Label htmlFor="booking-subject">Subject</Label>
            <Input
              id="booking-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={pending || batchLocked}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-body">Message to candidate</Label>
            <Textarea
              id="booking-body"
              className="min-h-60"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={pending || batchLocked}
              maxLength={10000}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Names and the role are filled in when sent. A “Choose an interview
            time” button is added automatically.
          </p>
          <Button
            className="w-full"
            disabled={
              !canSubmit ||
              !subject.trim() ||
              !body.trim() ||
              Boolean(
                bulkResults &&
                !bulkResults.some((row) => row.status === "failed"),
              )
            }
            onClick={() => submit("email")}
          >
            <Mail className="size-4" />
            {pending
              ? "Queuing invitations…"
              : bulk
                ? bulkResults
                  ? "Retry failed invitations"
                  : `Send ${bulk.recipients.filter((row) => row.eligible).length} booking invitations`
                : "Send booking invitation"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!locked && !bulk && (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            disabled={!canSubmit}
            onClick={() => submit("copy")}
          >
            <Copy className="size-4" />
            {pending
              ? "Saving…"
              : saved
                ? editing
                  ? "Update & copy link"
                  : "Copy booking link"
                : "Create & copy link"}
          </Button>
          {!showMessage && (
            <Button
              className="w-full"
              disabled={pending || !data.canInvite}
              onClick={() => setShowMessage(true)}
            >
              <Mail className="size-4" />
              Compose booking invitation
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Copying a link sends no email. Cal.com sends the calendar invitation
            after the candidate books.
          </p>
        </div>
      )}
      {link && (
        <div className="space-y-2">
          <Label htmlFor="booking-copy">Booking link to copy</Label>
          <Input
            id="booking-copy"
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
