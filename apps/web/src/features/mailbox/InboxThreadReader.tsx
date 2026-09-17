"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  File,
  FileArchive,
  FileImage,
  FileText,
  Archive,
  PanelRight,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  CaretLeftIcon,
  CheckIcon,
  DotsThreeVerticalIcon,
  EnvelopeSimpleDuotoneIcon,
  PaperPlaneDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import { MailComposer, type ComposerAttachment, type ComposerDraft, type ComposerTemplate } from "@/features/mailbox/MailComposer";
import { interpolateTemplate } from "@/features/email-templates/interpolate";
import type { InboxMessage, InboxThread } from "@/features/mailbox/data";
import { initiallyExpanded, splitQuotedText } from "./reading";
import { InboxForwardSheet } from "./InboxForwardSheet";

export type ReplyPayload = { body: string; html: string; subject: string; attachments: ComposerAttachment[]; idempotencyKey: string };

function renderAttachmentIcon(contentType: string) {
  const className = "size-4 shrink-0 text-muted-foreground";
  if (contentType.startsWith("image/")) return <FileImage className={className} />;
  if (contentType.includes("pdf") || contentType.includes("text")) return <FileText className={className} />;
  if (contentType.includes("zip") || contentType.includes("archive")) return <FileArchive className={className} />;
  return <File className={className} />;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentDownload({ attachment }: { attachment: InboxMessage["attachments"][number] }) {
  const [error, setError] = useState(false);

  async function download() {
    setError(false);
    try {
      const response = await fetch(`/api/mailbox/attachments/${attachment.id}`);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs">
      {renderAttachmentIcon(attachment.contentType)}
      <span className="min-w-0 flex-1 truncate font-medium" title={attachment.filename}>{attachment.filename}</span>
      <span className="shrink-0 text-muted-foreground">{formatSize(attachment.size)}</span>
      <button
        type="button"
        onClick={download}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={`Download ${attachment.filename}`}
      >
        <Download className="size-4" />
      </button>
      {error ? <span role="alert" className="text-destructive">Unavailable</span> : null}
    </div>
  );
}

function snippet(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "No message content.";
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

function MessageText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const url = part.replace(/[.,;!?]+$/, "");
    return <span key={index}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">{url}</a>{part.slice(url.length)}</span>;
  })}</>;
}

function ThreadMessage({ message, expanded, onToggle, isLast, participantName, onForward }: { message: InboxMessage; expanded: boolean; onToggle: () => void; isLast: boolean; participantName: string; onForward?: () => void }) {
  const outbound = message.direction === "outbound";
  const recipient = message.toEmails.length ? message.toEmails.join(", ") : "No recipients listed";
  const bodyId = `thread-message-${message.id}`;
  const content = splitQuotedText(message.body);

  return (
    <article className={cn("rounded-xl border bg-card px-4 shadow-sm sm:px-6", !isLast && "mb-3")}>
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-start gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <UserAvatar name={message.fromEmail} size="sm" className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-foreground">
                {outbound ? message.fromEmail : participantName}
              </span>
              {outbound ? <span className="shrink-0 text-[10px] font-medium text-muted-foreground">Sent</span> : null}
            </span>
            <time className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80" dateTime={message.receivedAt} title={message.receivedAt}>
              <RelativeTime value={message.receivedAt} />
            </time>
          </span>
          {expanded ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">to {recipient}</span>
          ) : (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground/70">{snippet(message.body)}</span>
          )}
        </span>
      </button>
      {expanded ? (
        <div id={bodyId} className="pb-5 pl-[calc(1.5rem+0.75rem)] pr-2">
          <details className="mb-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Message details</summary><dl className="mt-2 space-y-1 break-words"><div>From: {message.fromEmail}</div><div>To: {recipient}</div><div>Sent: {message.receivedAt}</div><div>Subject: {message.subject}</div></dl></details>
          <p className="whitespace-pre-wrap break-words text-[14px] leading-7 text-foreground"><MessageText text={content.body || "No plain-text body was included."} /></p>
          {content.quoted ? <details className="mt-4 text-sm text-muted-foreground"><summary className="cursor-pointer">Show quoted text / signature</summary><p className="mt-3 whitespace-pre-wrap break-words leading-6">{content.quoted}</p></details> : null}
          {message.attachments.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Attachments</p>
              {message.attachments.map((attachment) => <AttachmentDownload key={attachment.id} attachment={attachment} />)}
            </div>
          ) : null}
          {onForward ? <Button variant="ghost" size="sm" className="mt-3" onClick={onForward}>Forward this email</Button> : null}
        </div>
      ) : null}
    </article>
  );
}

export function InboxThreadReader({
  thread,
  messages,
  isPending,
  canReply,
  onBack,
  onMarkRead,
  onMarkUnread,
  onSendReply,
  suggestedReply,
  actionsSlot,
  loading = false,
  conversations = [],
  onSelectThread,
  onNewThread,
  onToggleDetails,
  detailsOpen,
  draft,
  onDraftChange,
  senderAddress,
  onArchive,
  templates = [],
  companyName,
  senderName,
  markReadOnOpen = false,
}: {
  thread: InboxThread;
  messages: InboxMessage[];
  isPending: boolean;
  canReply: boolean;
  onBack?: () => void;
  onMarkRead: (thread: InboxThread) => void;
  onMarkUnread?: () => void;
  onSendReply: (payload: ReplyPayload) => Promise<{ ok: boolean; error?: string; sentCopySaved?: boolean }>;
  suggestedReply?: string | null;
  actionsSlot?: React.ReactNode;
  loading?: boolean;
  conversations?: InboxThread[];
  onSelectThread?: (thread: InboxThread) => void;
  onNewThread?: () => void;
  onToggleDetails?: () => void;
  detailsOpen?: boolean;
  draft?: ComposerDraft;
  onDraftChange?: (draft: ComposerDraft | undefined) => void;
  senderAddress?: string | null;
  onArchive?: () => void;
  templates?: ComposerTemplate[];
  companyName?: string;
  senderName?: string;
  markReadOnOpen?: boolean;
}) {
  const canSendReply = canReply && Boolean(thread.participantEmail);
  const [composerOpen, setComposerOpen] = useState(canSendReply && Boolean(suggestedReply || draft));
  const [draftDiscarded, setDraftDiscarded] = useState(false);
  // Defaults are computed after async messages arrive, not just on first mount.
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const orderedMessages = [...messages].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  const latestId = orderedMessages.at(-1)?.id;
  const [unreadAtOpen] = useState(thread.unreadCount);
  const initiallyUnreadIds = new Set(unreadAtOpen > 0
    ? orderedMessages.filter((message) => message.direction === "inbound").slice(-unreadAtOpen).map((message) => message.id)
    : []);
  const markedRead = useRef(false);
  useEffect(() => {
    if (markReadOnOpen && !loading && messages.length && thread.unreadCount && !markedRead.current) {
      markedRead.current = true;
      onMarkRead(thread);
    }
  }, [markReadOnOpen, loading, messages.length, thread, onMarkRead]);
  const [forwardMessage, setForwardMessage] = useState<InboxMessage | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  function openReply() {
    setComposerOpen(true);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ block: "nearest" });
      composerRef.current?.querySelector<HTMLElement>("[contenteditable=true]")?.focus();
    });
  }
  const participantName = thread.candidateName ?? thread.participantEmail ?? "Unknown sender";
  const replySubject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;

  function toggle(message: InboxMessage) {
    setExpandedIds((current) => ({ ...current, [message.id]: !(current[message.id] ?? (initiallyExpanded(message, latestId) || initiallyUnreadIds.has(message.id))) }));
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/20 duration-200 animate-in fade-in" aria-label="Email conversation">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-3.5">
        <div className="flex min-w-0 flex-1 basis-full items-start gap-3 sm:basis-auto">
          {onBack ? (
            <Button variant="ghost" size="icon-sm" className="-ml-2 mt-0.5 shrink-0 lg:hidden" aria-label="Back to people" title="Back to people" onClick={onBack}>
              <CaretLeftIcon className="size-4" />
            </Button>
          ) : null}
          <UserAvatar name={participantName} src={thread.candidateAvatarUrl} size="md" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">{participantName}</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Email</span>
              {thread.participantEmail ? <span> · {thread.participantEmail}</span> : null}
              <span> · {messages.length} {messages.length === 1 ? "message" : "messages"}</span>
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
          {onArchive ? <Button variant="ghost" size="icon-sm" onClick={onArchive} disabled={isPending} aria-label="Archive conversation"><Archive className="size-4" /></Button> : null}
          {onNewThread ? <Button variant="ghost" size="icon-sm" onClick={onNewThread} aria-label="New email"><Plus className="size-4" /></Button> : null}
          {onToggleDetails ? <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={onToggleDetails} aria-label="Candidate details" aria-expanded={detailsOpen}><PanelRight className="size-4" /></Button> : null}
          {canSendReply ? (
            <Button size="sm" className="active:scale-[0.97] motion-reduce:active:scale-100" onClick={openReply} aria-expanded={composerOpen}>
              <PaperPlaneDuotoneIcon className="size-4" />
              Reply
            </Button>
          ) : null}
          {thread.unreadCount ? (
            <Button size="sm" variant="outline" onClick={() => onMarkRead(thread)}>
              <CheckIcon className="size-4" />
              <span className="hidden sm:inline">Mark read</span>
            </Button>
          ) : onMarkUnread ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => { markedRead.current = true; onMarkUnread(); }}>Mark unread</Button> : null}
          {actionsSlot ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Conversation actions">
                  <DotsThreeVerticalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0">{actionsSlot}</DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      <div className="flex items-center gap-3 border-b bg-background px-5 py-2">
        {conversations.length > 1 ? <Select value={thread.id} onValueChange={(id) => { const target = conversations.find((item) => item.id === id); if (target) onSelectThread?.(target); }}><SelectTrigger className="min-w-0 flex-1" aria-label="Email conversations"><SelectValue /></SelectTrigger><SelectContent>{conversations.map((item) => <SelectItem key={item.id} value={item.id}>{item.unreadCount ? "● " : ""}{item.subject}</SelectItem>)}</SelectContent></Select> : <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.subject}</h2>}
        {messages.length > 1 ? <Button variant="ghost" size="sm" onClick={() => setExpandedIds(Object.fromEntries(messages.map((message) => [message.id, true])))}>Expand all</Button> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5 sm:px-6">
        {loading ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading messages…</p> : messages.length ? (
          <div className="mx-auto w-full max-w-4xl">
            {orderedMessages.map((message, index) => (
              <ThreadMessage key={message.id} message={message} participantName={participantName} expanded={expandedIds[message.id] ?? (initiallyExpanded(message, latestId) || initiallyUnreadIds.has(message.id))} onToggle={() => toggle(message)} isLast={index === messages.length - 1} onForward={canReply ? () => setForwardMessage(message) : undefined} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <EnvelopeSimpleDuotoneIcon className="size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No message content</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">This conversation exists, but the provider did not include a readable message body.</p>
          </div>
        )}
      {!canReply ? (
        <div className="shrink-0 border-t border-border/70 bg-muted/20 px-5 py-3.5">
          <div className="flex items-start gap-3">
            <EnvelopeSimpleDuotoneIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Email sending is not connected</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Set up a sender in Email settings to reply from the Inbox. Until then, open the candidate profile to send messages.</p>
              {thread.candidateId ? <Link className="mt-2 inline-block text-xs font-semibold text-foreground underline underline-offset-4" href={`/dashboard/candidates/${thread.candidateId}`}>Open candidate profile</Link> : null}
            </div>
          </div>
        </div>
      ) : null}

      {canSendReply && thread.participantEmail && !loading ? (
        <div ref={composerRef} className="mx-auto mt-4 w-full max-w-4xl">
          {composerOpen ? <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold">Reply to {participantName}</p>
              <MailComposer
                templates={templates.map((template) => ({ ...template, subject: "", body: interpolateTemplate(template.body, { candidate_full_name: participantName, candidate_first_name: participantName.split(" ")[0], candidate_last_name: participantName.split(" ").slice(1).join(" "), job_title: thread.jobTitle ?? "", stage_name: thread.applicationStageName ?? "", company_name: companyName, sender_name: senderName }) }))}
                from={senderAddress}
                draft={draftDiscarded ? undefined : draft}
                onDraftChange={onDraftChange}
                to={thread.participantEmail}
                showSubject={false}
                defaultSubject={replySubject}
                defaultBody={draftDiscarded ? "" : suggestedReply ?? ""}
                placeholder={`Reply to ${participantName}…`}
                sendLabel="Send reply"
                disabled={isPending}
                onCancel={() => { setDraftDiscarded(true); setComposerOpen(false); }}
                onSend={async ({ subject, text, html, attachments, idempotencyKey }) => {
                  const result = await onSendReply({ subject, body: text, html, attachments, idempotencyKey });
                  if (result.ok) { onDraftChange?.(undefined); setDraftDiscarded(true); setComposerOpen(false); }
                  return {
                    ok: result.ok,
                    error: result.error,
                    note: result.ok && result.sentCopySaved === false ? "Sent, but the copy could not be saved to Sent." : undefined,
                  };
                }}
              />
          </div> : <div className="flex flex-wrap gap-2"><Button variant="outline" className="bg-card" onClick={openReply}><PaperPlaneDuotoneIcon className="size-4" />Reply to {participantName}</Button>{orderedMessages.at(-1) ? <Button variant="outline" className="bg-card" onClick={() => setForwardMessage(orderedMessages.at(-1)!)}>Forward latest email</Button> : null}</div>}
          {composerOpen ? <p className="mt-2 text-xs text-muted-foreground">Draft kept while switching conversations in this inbox. Reloading clears it.</p> : null}
        </div>
      ) : null}
      </div>
      <InboxForwardSheet key={forwardMessage?.id ?? "closed"} message={forwardMessage} senderAddress={senderAddress} onClose={() => setForwardMessage(null)} />
    </section>
  );
}
