# Recruitment automations

Automations are available at **Automations** in the sidebar. Workspace members need `automations:manage` and unrestricted workspace scope to manage them. Each step rechecks the creator's action permission. This first version supports workflow management through the dashboard; the legacy REST endpoints remain disabled.

## Building a workflow

Start from a blank workflow or an editable template. Configure **When**, the optional job filter, **If** conditions with AND/OR/NOT groups, and up to ten ordered **Do** actions. Saving creates a draft and pauses a previously published workflow. Publish explicitly to start execution. Editing or pausing cancels pending work from that definition version, including candidate messages waiting in the email outbox.

Templates are ordinary workflow definitions. Thresholds, stages, recruiter pool, message and timing are editable. No template contains privileged execution logic.

New booking invitation actions start with a subject and complete message. Existing blank fields are prefilled when the builder opens; custom wording is preserved. Use **Use suggested wording** to restore the starter copy, then edit it as needed.

- **Application submitted**: questionnaire scores are already saved. Missing/unscored is not zero and does not meet a numeric threshold.
- **AI evaluation completed**: emitted durably in the evaluation transaction. Conditions can combine `ai.score`, `ai.source` and `application.questionnaireScore`. AI evaluation itself must be enabled or requested separately. The starter requires source `ai`, not the rules fallback.
- **Booking invitation unanswered**: choose hours after an automation invitation was actually sent, not when it was queued. Each workflow sends at most once per invitation and chosen offset. Use separate workflows for additional follow-ups.

Other existing application, candidate, interview and job event triggers remain available. Trigger availability depends on the originating operation emitting the event. Recorded, already-completed interviews are not scheduled reminders.

## Actions

Available actions are forward stage moves, notes, tags, tasks, Cal.com booking invitations and booking follow-ups. Stage moves only advance active applications on open jobs to active stages; they never email candidates. Messages are explicit actions, sent through the workspace email outbox and recorded in Inbox. Routine interview reminders are configured in **Settings → Interviews**, independently of workflows. The old reminder trigger, action and template are retired; queued legacy workflow reminders are suppressed.

Booking invitations use one personal Talmore link per application. Select one to ten recruiters in the invitation action. Each needs a personal Cal.com connection, a default event and configured booking sync. The page merges their available times, showing a shared slot once. Times use the candidate's selected time zone. Among free recruiters, Talmore selects the least recently assigned host and asks Cal.com to create the booking. Cal.com sends the calendar invitation and owns the meeting location, rescheduling and cancellation.

Use the same fixed duration and interview format for every event in a pool, with one configured video, phone or in-person location. In-person events must share an address. Paid, recurring, seated, instant and proposal bookings, extra required form questions, split-name fields and Cal.com email-verification flows are not supported. Publication validates the current provider settings; availability and confirmation recheck them.

Personal links expire after 90 days. They are generated at email delivery and kept out of workflow definitions, run logs and HTTP request URLs. The link's fragment supplies the token to a POST API. Saving pauses booking access until republication. Republishing updates open invitations to the new pool without replacing their URLs. Bookings already in progress retain their original host. Existing interviews suppress new invitations and follow-ups. Changing stage, closing the job, rejecting/withdrawing/hiring the application or removing the workflow creator's permission prevents booking. Disconnected recruiters are excluded. Follow-ups expire after 30 days and stop as soon as confirmation starts.

Confirmation reserves the application and recruiter before contacting Cal.com. ATS scheduling checks those reservations. Repeated clicks reuse the same attempt; timeouts never trigger a booking with a second recruiter. The domain-events cron reconciles uncertain writes using exact invitation/request metadata, with the signed application reference validated during sync. A no-match result stays unresolved, because it does not prove that Cal.com rejected the request. Candidates see a pending message and can contact their recruiter. A cancellation closes the personal invitation; it does not automatically send a new email or reopen booking.

Workflow messages support `{{candidate.firstName}}`, `{{candidate.lastName}}` and `{{job.title}}`. Booking buttons are appended automatically. Text and substitutions are HTML-escaped. See [interview reminder settings](interview-reminders.md) for scheduled interview reminders and the Cal.com sender choice.

Legacy raw email, HTTP, chat, status changes, offer and AI action types are not offered for publication in this version. Previously saved definitions require explicit republication under runtime version 2 before they execute.

## Execution and testing

Definitions and runs live in PostgreSQL. Domain events and timer occurrences use the same dispatcher, condition evaluator, ordered action handlers and run history. The existing domain-events cron scans reminders; webhooks cron recovers due runs. No additional scheduler service is required.

Runs retain their definition version and evaluated conditions. Retries skip successful steps and resume the remaining actions. Timer occurrence keys and invitation/outbox deduplication prevent duplicate dispatch. The sender rechecks workflow version, permissions, application status, booking status and the exact current interview time before sending. Canceling or rescheduling suppresses an obsolete queued reminder. An already accepted provider delivery cannot be recalled.

Timers recover up to one hour of scheduler delay, never send after interview start, and do not catch up occurrences predating publication. The test panel selects an exact application and evaluates its current conditions and job filter without sending messages or moving stages. It does not simulate a provider booking or guarantee future eligibility.

Migration 0158 adds durable booking-invitation tracking; 0160 adds personal pooled booking state and 0161 records host allocation time separately from later booking updates. Apply generated migrations before starting the updated app and scheduler. Integration tests use `RUN_AUTOMATIONS_INTEGRATION=1` and `RUN_PERSONAL_CAL_INTEGRATION=1` with the local `harly_talmore_eval` database and fictional data; they do not call Cal.com or deliver email.
