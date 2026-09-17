# Questionnaire scoring and Meta advertising

## Configure a questionnaire

In the job editor's Application section, enable **Score this question** for a
single-select or multi-select question. Set its weight from 1 to 10 and give
each choice 0 to 10 points. At least one choice must have a positive score.
Text, URL and unscored questions do not contribute.

Each question contributes its weight multiplied by its answer score. The final
percentage divides total earned points by total available weighted points.
Available points use the highest configured choice score, not an assumed 10.

- Single-select uses the selected choice's score.
- Multi-select uses the arithmetic mean of the selected choices' scores.
  Checking more boxes does not accumulate points. This rule is shown in the
  editor.
- An unanswered optional scored question earns zero and remains in the
  denominator. A required question still needs an answer.
- An unscored questionnaire produces no score, rather than a misleading zero.

Harly calculates scores on the server for public applications, embedded/API
applications and candidate-portal submissions. Client-provided scores are never
used. Manually adding an existing candidate to a pipeline does not invent a
questionnaire score.

Each application stores the final score and a snapshot of the labels, choices,
point values, weights, selections and qualification threshold used at submission.
Later job edits do not recalculate existing applications. Existing applications
are not backfilled.

The pipeline shows questionnaire scores separately from AI scores. Use the
highest-score sort and minimum-score filter to prioritize candidates. Drag
reordering is disabled while score sorting is active; bulk stage actions remain
available. Candidate application details show the saved calculation breakdown.

## Meta Pixel and Conversions API

Under **Settings → Integrations → Meta advertising**, an authorized workspace
administrator can open the dedicated integration page and save a numeric
Pixel/Dataset ID. No Facebook login or arbitrary script snippet is needed.
To add server-side delivery, generate a Conversions API access token in Meta
Events Manager, paste it into the password field, enable Conversions API and save.
Tokens are encrypted with the server's existing `AI_ENCRYPTION_KEY` and are
never returned by settings reads. A blank token field preserves the saved token.
Changing datasets requires a new token; Disconnect removes it and cancels pending
deliveries. Pixel-only mode remains available.

On Harly-hosted public job and application pages, the browser integration sends:

| Event | When |
| --- | --- |
| `ViewContent` | The page is viewed with marketing consent |
| `ApplicationStarted` | The visitor first interacts with the application form |
| `SubmitApplication` | Harly confirms a successfully saved application |
| `QualifiedApplication` | That saved application meets the configured threshold |

Set the **Qualified application threshold** from 0 to 100 in each job's
questionnaire. Leaving it blank disables the qualified event. Applications
below the threshold are accepted normally. A questionnaire without scored
questions never produces a qualified event. Qualification uses the unrounded
percentage; the displayed score is rounded to two decimal places.

Tracking waits for marketing-cookie consent. Revoking consent pauses tracking.
Automatic event detection is disabled, and Harly does not supply applicant names,
plain-text email addresses, questionnaire answers or raw scores as event parameters. Event
parameters include the job identifier. Stable application event IDs prevent
duplicate dispatches when React rerenders the success state.

Create a custom conversion for `QualifiedApplication` in Meta Events Manager
and check that it is eligible for the intended employment campaign. No Purchase
events or fabricated monetary values are sent.

Job-specific URL rules must include the application route (`/apply/<slug>`),
including a `/board/<workspace>` prefix where applicable. Filtering only on
`/jobs/<slug>` excludes server conversions and browser conversions on the
application page. Verify the saved rule and the ad set's selected conversion
after changes. Accepted event delivery does not prove custom-conversion matching
or ad attribution, and raw received-event totals do not prove deduplication.

With Conversions API enabled, consented hosted form submissions queue
`SubmitApplication` and, when qualified, `QualifiedApplication` in the same
transaction as the saved application. The server's authority is the saved
questionnaire result, never a client-provided score. No network call to Meta
runs in the application transaction. Browser events and server events use the
same event names and IDs: the application UUID, with `:qualified` appended for
the qualified event. Meta uses these for deduplication.

The scheduler calls `/api/cron/meta-conversions` every minute. Workers claim
events with short row-lock transactions and two-minute leases, then release
database connections before sending to the pinned Meta Graph API v25.0 endpoint.
Interrupted workers recover after the lease expires with the original event ID.
Temporary network errors, rate limits and transient provider errors retry with
exponential backoff, at most ten attempts and no later than 47 hours after the
original event. The deadline stays within the browser/server deduplication
window. Permanent failures appear in Recent server deliveries. Disconnects,
destination changes, deleted applications and expired events cancel queued delivery.
Requests already in flight at disconnect cannot be retracted.
Changing the test code does not change already queued events.

Server matching sends IP address, user agent and available `_fbp` / `_fbc`
cookies plus SHA-256-hashed email and international phone numbers from the
consented submission. Emails are trimmed and lowercased; phone punctuation is
removed, retaining the country code. Numbers without an explicit `+` country
code are omitted rather than guessed. Hashes remain personal matching data,
not anonymous data. Names, plain-text contact details, answers and raw scores
are not sent. Hashing happens before the encrypted outbox payload is stored.
The click identifier from `fbclid` is retained in `_fbc` only after marketing
consent, even if the Pixel SDK is blocked. URLs sent to Meta are canonical
application URLs without query parameters. Matching data is encrypted while
queued and cleared after delivery, cancellation or terminal failure. Delivery
metadata is removed after 30 days; hard deletion of an application cascades to
its delivery records. Consent is checked at submission; later browser consent
changes cannot retract already submitted conversion events.

To test, save the code from Meta Events Manager's Test Events tab, then click
**Send test event**. This sends a `HarlyConnectionTest` event using the
administrator's request IP/user agent. It does not create an application.
Real applications while a test code is saved send server test events; browser
Pixel behavior remains unchanged. Clear the code and save before live campaigns.
Check real delivery in Events Manager before campaign optimization.

Page views and application-start events remain browser-only. Embedded/API and
portal submissions still receive scores but do not enqueue Conversions API events.
Conversions API requires explicit marketing consent and does not bypass consent.

## MCP

- `create_draft_job` creates a draft, default pipeline and hiring-team assignment.
  It requires `jobs:create` and never publishes a job.
- `get_job_questionnaire` returns questions, scoring, threshold and update version
  for an accessible draft or published job. It requires `jobs:view`.
- `set_job_questionnaire` replaces the questionnaire, requiring `jobs:edit` and
  the last-read `updatedAt` value. Preserve existing question IDs when editing.
  A stale version is rejected rather than overwriting another recruiter's work.
  Omitting the threshold disables qualification tracking.

These tools use the existing `harly:read` and `harly:write` scopes and current
workspace permissions. They do not publish drafts or change old application
scores. Scoring rules are omitted from public job-page and job-API payloads.

## Deployment

Migration `0148_superb_gressill` adds nullable questionnaire score and snapshot
columns to applications and a nullable Meta Pixel ID to workspace settings.
It does not change existing scores or backfill old applications. Run the migration
service successfully before starting the new app and scheduler image.

The migration is additive and compatible with the previous application image.
If an application rollback is needed, retain the added columns and migration
tracking record. Do not reverse or edit the applied migration. No new environment
variables are required; configure the Pixel ID in workspace settings after deploy.

Migration `0150_silly_king_bedlam` adds encrypted Conversions API configuration
and the delivery outbox. Run migrations before the updated app and scheduler.
This migration is additive; keep the columns and tracking records on application
rollback. Existing Pixel IDs remain configured, and Conversions API starts disabled.
The same `AI_ENCRYPTION_KEY` must be available to app and scheduler deployments.
