# Talmore agency workflow

## Clients

Clients is a primary sidebar destination. Companies have a name, website,
contacts and internal notes. Archive preserves job links and offer history;
archived companies cannot be selected for a new job link. Restore makes them
selectable again. There is no client login or external sharing feature.

`clients:view` grants access to the workspace company directory.
`clients:manage` permits create, edit, archive and job linking. Recruiters receive
both by default; existing customized roles keep their explicit grants. Linking
also requires `jobs:edit` and access to that job. Client detail pages only show
jobs the viewer can access. Company-directory access is workspace-wide, separate
from job assignment. Client contacts are external contacts, not ATS users.

Use the job editor's **Client · internal** selector, or the job list on a client
page, to link a saved job. This saves independently of the job form. A null
client means an internal or not-yet-assigned vacancy. Cross-workspace links are
rejected by both the action and a composite database foreign key.

Client IDs are stripped from public job projections. Public pages retain Talmore
branding and use “with Talmore” rather than “at Talmore” in default wording.
Existing custom descriptions, branding and email templates are not rewritten.
Internal pipeline rows include the client name; All open jobs supports a client
filter. Client records and client-issued offers are never published to the
candidate portal.

## Pipeline

New jobs use Applied → Screening → Interview → Submitted → Offer → Hired,
with Rejected and Rejected by client as alternative outcomes. Submitted means presented to the client.
It remains an active application and sends no automatic email. Notes can record
the presentation details. There is no submission object or client-interview
integration in this release.

Migration 0152 inserts Submitted before Offer on existing jobs that have an
Interview stage before Offer and no Submitted/Submitted to client stage.
Later stages shift in descending order to preserve the unique stage-order index.
Stage IDs, current applications and stage history are preserved. Nonstandard
pipelines without that Interview/Offer pattern are left for explicit configuration.

Migration 0153 adds **Rejected by client** to existing nonempty pipelines. Both
rejection stages map to the terminal `rejected` application status, so neither
is included in active counts. The candidate's Reject options menu offers
Rejected by client; board/list stage moves also work. Explicit rejection still
offers an unchecked send-email option; stage moves remain silent.

New decisions store `agency` or `client` on the application and on the stage
history row. Reopening clears the current rejection source but preserves its
history, and restores the latest active stage rather than another rejected stage.
Historical rows keep a null source: existing undifferentiated rejections are not
retroactively attributed to Talmore or the client. Rejection of a client-issued
offer is a candidate decision and is separate from rejection by the client.

## Client offers and hires

On a candidate, open **Offers & hire** and choose the application.

- **Record client offer** stores the offer date, pending/accepted/declined/
  withdrawn decision, and optional free-text terms. Unknown compensation is fine.
  The job must have a client. The original client stays attached to an offer even
  if the job is subsequently reassigned. Editing a decision records its decision
  timestamp. These internal records do not send email, move stages, or hire.
- **Mark as hired** requires no offer. Record the placement-confirmation date and
  optional terms/start date. Status, stage, history and hire details are saved in
  the existing transaction. Re-saving hire details does not create another hire
  transition. Existing Hire buttons and board moves continue to work; the recorded
  transition date is the fallback until a recruiter enters a hire date.
- **Offers sent through Talmore** remains the existing offer/sending workflow.
  Its existing acceptance-to-hired behavior is unchanged. It is separate from
  recording a client-issued offer.

Offer recording requires `offers:manage` for the application. Hire editing
requires `candidates:edit`, with the usual job-scoped authorization. No client
offer or terms are copied into outbound messages or portal records.

## Reporting

Dashboard and report offer acceptance use accepted / (accepted + declined)
recorded offers, including client-issued offers. Pending/withdrawn offers and
hires without offers do not change that ratio. The dashboard uses decision dates
for its two 14-day periods; the Reports summary retains its all-time scope.
Do not record the same offer in both workflows or it will count twice.

The canonical hiring-event query uses the entered hire date where present,
otherwise the existing first Hired transition. This feeds dashboard/report hire
counts and time-to-hire. A date-only hire is represented at UTC midnight for
report aggregation. Broader client submission/placement reports and start-date
tracking are future work.

## Verification

Local integration coverage checks client authorization, cross-workspace links,
public projection, archival, offer decisions without email or auto-hiring,
hiring without an accepted offer, backdated hire reporting and repeated edits
without duplicate hire history. Migration SQL, snapshot, journal and database
hashes/timestamps must agree before deployment.
