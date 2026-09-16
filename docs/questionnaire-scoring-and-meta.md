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

## Meta Pixel

Under **Settings → Integrations → Meta advertising**, an authorized workspace
administrator can save a numeric Pixel/Dataset ID. An empty value disconnects
the integration. No Facebook login or arbitrary script snippet is needed.

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
email addresses, questionnaire answers or raw scores as event parameters. Event
parameters include the job identifier. Stable application event IDs prevent
duplicate dispatches when React rerenders the success state.

Create a custom conversion for `QualifiedApplication` in Meta Events Manager
and check that it is eligible for the intended employment campaign. No Purchase
events or fabricated monetary values are sent.

This implementation uses the browser Pixel. Ad blockers can prevent delivery.
It does not yet configure Conversions API, durable server-side retries or tracking
inside third-party embed hosts. Embedded submissions still receive their score
in Harly. Test delivery in Meta Events Manager with the real Pixel before using
the qualified conversion for campaign optimization.

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
