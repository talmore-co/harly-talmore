# Manual interview booking invitations

In **Schedule interview**, choose **Set a time** for the existing scheduling form or **Let candidate choose** for a personal Talmore booking page.

Select an interview type and one to ten eligible interviewers. Each interviewer needs a connected personal Cal.com account, a saved default event and configured booking sync. The form checks the duration and meeting format against Cal.com. Events must use the same fixed duration and format; in-person events must share an address. See [automations](automations.md) for the provider event restrictions.

- **Create & copy link** records an invitation without sending email, creating an interview or moving the application.
- **Compose booking invitation** opens an editable subject and message. **Send booking invitation** explicitly queues an email, attributed to the sending member and linked to the application in Inbox. Replies route to the application. The scheduler handles delivery retries.
- The candidate sees merged, deduplicated availability. One available recruiter is assigned using the same least-recently-assigned selection and durable reservations as automation invitations.
- The selected interview type is saved on the interview after booking. Cal.com owns calendar invitations, location, rescheduling and cancellation.

There is one pooled invitation per application. Existing invitations are shown in the drawer. Copying reuses the link. **Update eligible interviewers** explicitly updates an open invitation while preserving its URL and makes it manually managed. Later workflow changes no longer modify it. Stale updates are rejected. Booked, canceled and uncertain bookings cannot be overwritten.

Manual invitations do not require an automation or the automation feature flag. Creating, updating and sending require application-scoped `collab:write` permission and active workspace membership. Candidate booking rechecks the invitation creator's current access. An inactive application, changed stage, closed job, removed access or expired link blocks booking. Updating an open invitation refreshes its 90-day expiry. No stable public job booking link is created.

Queued emails recheck actor access, invitation revision, source workflow if applicable, expiry, application stage and existing interviews before sending. Editing the pool invalidates earlier queued invitations. Copying a link never enables automated follow-ups.

Migration **0163** makes the existing pooled invitation record usable without a workflow and adds its manual creator, interview type and revision. Apply migrations before starting the updated app and scheduler.

## Bulk invitations from Pipeline

Select applications in the pipeline list or board and choose **Send booking invites**. A batch can contain up to 100 applications, including different jobs. Review the recipient list, choose the shared eligible interviewers and interview type, then edit the message and explicitly send. Each eligible application gets its own personal link and separate email. Candidate names and job titles are substituted per application.

Applications without access, inactive applications, closed jobs, existing interviews and existing booking invitations are skipped with an explanation. Bulk sending never replaces an existing pool or takes an invitation away from an automation. Manage those invitations individually through Schedule interview. Results show queued, skipped and failed applications. Retrying a failed request with the same batch identity does not queue a second email for successful applications.

## Range selection

Shift-click a row checkbox to select the inclusive range from the previous ordinary click. Shift-click a selected endpoint to deselect the range. Ranges follow the current visible order and never include hidden rows or other pages. Changing the visible order invalidates the old anchor. The behavior is shared by Pipeline lists and cards, Candidates, the talent pool, Documents and the dashboard application table.
