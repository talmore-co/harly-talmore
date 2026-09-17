"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MailComposer } from "./MailComposer";
import { createMailboxThreadAction } from "./actions";
import type { InboxMessage } from "./data";

export function InboxForwardSheet({ message, onClose, senderAddress }: { message: InboxMessage | null; onClose: () => void; senderAddress?: string | null }) {
  const [recipient, setRecipient] = useState("");
  if (!message) return null;
  const quoted = `\n\n---------- Forwarded message ----------\nFrom: ${message.fromEmail}\nDate: ${message.receivedAt}\nSubject: ${message.subject}\nTo: ${message.toEmails.join(", ")}\n\n${message.body}`;
  const escaped = quoted.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader><SheetTitle>Forward email</SheetTitle></SheetHeader>
      <div className="space-y-4 p-4">
        <label className="block space-y-2 text-sm">Recipient<Input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="name@example.com" /></label>
        {message.attachments.length ? <p className="text-xs text-muted-foreground">Original attachments are not included. Download and attach any files you want to forward.</p> : null}
        <MailComposer from={senderAddress} to={recipient} defaultSubject={/^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`} defaultBody={`<p>${escaped}</p>`} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)} onCancel={onClose} onSend={async (payload) => {
          const result = await createMailboxThreadAction({ candidateId: null, toEmail: recipient, subject: payload.subject, body: payload.text, html: payload.html, idempotencyKey: payload.idempotencyKey, attachments: payload.attachments.map(({ filename, contentType, base64 }) => ({ filename, contentType, base64 })) });
          if (result.ok) onClose();
          return result;
        }} />
      </div>
    </SheetContent>
  </Sheet>;
}
