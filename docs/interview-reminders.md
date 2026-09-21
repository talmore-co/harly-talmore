# Interview reminders

Configure routine candidate reminders in **Settings → Interviews**. Access requires `settings:edit`. Reminders are off by default and work independently of the automation feature flag or a workflow creator's account.

The setting includes:
- Send candidate reminders on/off.
- Hours before the interview, from 0.25 to 720, initially 24.
- The time zone used in the email, shown explicitly next to the interview time.
- Prefilled, editable subject and message, plus a button to restore suggested wording.
- A Cal.com choice. **Use Cal.com settings** is the default and excludes Cal.com bookings from Talmore reminders. **Send reminders from Talmore** includes them. This choice does not alter Cal.com's own workflows; disable those in each recruiter account when choosing Talmore.

Supported variables are `{{candidate.firstName}}`, `{{candidate.lastName}}`, `{{job.title}}`, `{{interview.when}}` and `{{interview.location}}`. Template substitutions are HTML-escaped. The default greeting and job name contain no client identity or private job guidance.

The domain-events scheduler queues a durable `interview.reminder` email when the configured time arrives. There is no additional scheduler service. Only future scheduled interviews for active applications on open jobs qualify. Deleted or anonymized candidates, canceled/completed interviews and inactive applications are excluded. The outbox checks eligibility again immediately before delivery, including the exact interview time and current settings revision.

Rescheduling invalidates the old queued reminder. The new interview time receives its own reminder when due. Repeated scheduler runs, retries and settings changes cannot send a second reminder for the same interview/time pair. Saving settings invalidates previously queued reminders; new reminders must become due after the save. Nothing is backfilled from before enablement. Scheduler recovery is limited to one hour, and no reminder is sent after interview start.

Messages use the workspace sender and appear as **System email** in candidate communications, linked to the application. Reply routing uses the application's inbound address when configured. They do not move stages, change interview status or create calendar invitations.

Existing workflow reminder actions remain readable in history but cannot be published or delivered. Set up the workspace setting explicitly; upgrading does not enable reminders.

Migration 0162 adds the settings column. Integration tests use `RUN_INTERVIEW_REMINDERS_INTEGRATION=1` against the isolated local `harly_talmore_eval` database and fictional fixtures; no real emails are sent.
