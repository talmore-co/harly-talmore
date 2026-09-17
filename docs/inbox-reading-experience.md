# Inbox reading experience

The inbox groups conversations by candidate, falling back to normalized email
address for unlinked senders. Filter counts count people in the loaded results.
Clicking a person opens the last thread visited during this inbox session, or an
unread incoming thread, or the most recently active thread. Other conversations
are available from the subject selector. Mobile has a back-to-people action.

## Reading and replying

Messages are chronological. The latest message and unread incoming messages
expand by default, including messages loaded after the reader mounts. Older
messages collapse to sender and preview. Expand all and per-message toggles are
available. Recipient details and recognizable quoted history/signatures can be
expanded without losing the original plain-text content.

Replies use an inline rich-text composer with the resolved sending identity,
the thread's participant address, attachments and general email templates.
Template insertion keeps the reply subject. Draft body, attachments and the
send idempotency key are retained in memory while switching threads. Discard
and successful sending clear the draft. Reloading or leaving the inbox clears
in-memory drafts; the UI states this. Drafts are not written to browser storage.

Forward latest email opens a new-message composer with an editable destination
and quoted message. Attachments must be explicitly downloaded and reattached.
Forwarding creates a new thread; it does not change the original participant.
The current delivery model supports a single primary recipient. Reply-all and
Cc/Bcc require recipient-role persistence and transport support before they can
be exposed as working controls.

Mark read/unread and archive operate on the selected thread. Mark unread sets
the latest message unread and recomputes the count, so retries do not increment
it repeatedly. Candidate context is collapsible; assignment and linking controls
are inside an edit disclosure. Outbound automated receipts do not count as
needing a reply. Receipt activity is identified from its outbox record rather
than inferred from its subject.

New application receipts record plain text rendered from the same React email
element sent to the candidate, with the known application ID. Historical summary
records are not reconstructed from today's templates.

## Future channels

Keep the person as the grouping identity, with separate conversations underneath.
A channel identifies the interaction model, such as email or WhatsApp. A
connected account identifies the sending address/number, and a provider adapter
handles delivery. Existing IMAP/provider/webhook transport labels are not
channels. Email subjects and recipient roles remain email-specific; a future
WhatsApp composer can enforce its own sending rules without changing email.

Future integrations, including a possible Zernio adapter, must preserve channel,
account, external conversation/message IDs and delivery state. Deduplicate within
the provider/account namespace. Link identities using verified associations,
not display names or a guessed phone match. Routing, permissions and candidate
application context stay in the ATS. Changing channels should explicitly open
the corresponding conversation rather than silently redirect an existing draft.
No WhatsApp integration, provider credentials or future-channel schema is added
by this interface change.
