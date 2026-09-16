# Candidate email controls

## Pipeline and rejection

Moving an application between stages sends no email. This applies to dragging,
bulk moves, moves into Rejected, and API-driven changes. Legacy per-stage email
settings are ignored and their board menu has been removed.

The explicit Reject action opens a confirmation dialog in the candidate profile,
candidate directory, and pipeline list/board. **Send rejection email** starts
unchecked on every use. Selecting it sends the active workspace Rejection
template, or the built-in message, to newly rejected applications only. Cancel
changes nothing. Rejecting an already rejected application does not resend email.
For a later message, use the candidate email composer.

Old queued automatic pipeline messages are suppressed by the delivery worker and
marked failed with a suppression reason, without retrying. Previously delivered
emails cannot be recalled. Portal status notifications remain separate from email.

## Templates

Templates select wording; activating one does not enable sending. Interview,
Rejection and Offer are event-message types. General, Screening and Stage change
are manual-only. Existing Stage change templates remain available for composing
manual outreach; they no longer activate a pipeline trigger.

There is one active message per event type per workspace. Deactivation restores
the built-in message rather than disabling delivery.
On each event-message card, use the **Use this template** on/off switch to select
its wording. Edit and Delete are separate controls at the top of the card.

Use **Create template** to choose suggested wording for an interview invitation,
rejection, offer, screening outreach or stage update, or start with a blank
template. The editor fills in the selected suggestion; nothing is saved until
you click **Save template**. The same chooser is available before and after the
first template is created. **How emails work** explains sending rules on the page.

## Other sending controls

- Interview scheduling retains its **Send invitation email** checkbox.
- Sending an offer is an explicit action, separate from moving into Offer.
- Application submission confirmations continue to use the built-in flow.
- Manual candidate messages require Send in the composer.
- Provider-managed invitations, including Cal.com notifications, are separate.
- Email provider settings configure delivery, not a master email-disable switch.

Automations are currently disabled by the product switch, absent from navigation,
and their page returns not found. Workflow dispatch is disabled too. The remaining
automation implementation in the repository does not mean the feature is available.

No database migration or new environment variables are required for this change.

## Built-in email content

Candidate emails use the workspace name/logo and accent color, with a contrasting
button label. Product-email fallbacks use Talmore. Neither layout shows vendor
credits. Candidate portal sign-in emails receive the workspace branding too.

Interview emails carry the timezone supplied by scheduling, including its UTC
offset. Date and time template variables are separate. Older payloads and API
requests without a timezone display explicitly labeled UTC. Cancellation emails
reuse the last known invitation timezone when available.

Invitations and rescheduling emails include an `interview.ics` attachment. Newly
queued events carry the interview ID so imports use the same calendar UID across
rescheduling, with an increasing sequence. Actual import/update behavior depends
on the calendar client. Existing provider invitations should be used when already
updated; rescheduling emails no longer link to Google's create-new-event form.
Old queued invitations without an interview ID have a delivery-specific UID.

The scheduling **Message to candidate** field appears in invitation/calendar
content. Internal preparation belongs in candidate notes. HTTPS meeting locations
are explicit **Join interview** links.

Rejection portal buttons only appear when the portal is enabled. Cancellation
messages do not promise another interview. Withdrawal messages always state that
the offer was withdrawn, even when a reason is supplied. Offer wording refers to
the offer's employer details rather than assuming the recruiting workspace is
the employer.

Starter templates no longer promise profile retention, claim an attachment is
present, or assume that another candidate was selected. The offer starter uses
the offer-review URL. Event templates fall back to the workspace recruiting team
for `sender_name` when a personal sender name is unavailable. Existing custom
template text is not overwritten by this update.
