# Candidate communication

The candidate name in the Inbox reader and candidate details panel links to the candidate profile. Unknown senders remain plain text until linked to a candidate.

Inbox includes a searchable job filter, including All jobs and No linked job. It combines with existing status filters, persists in the URL and applies before pagination and message loading. It uses the conversation's linked application, not every job the candidate has applied for. Changing the job resets the selected thread and pagination.

## Sender attribution

Outgoing profile messages display the recorded member's name instead of the hard-coded "You". Canonical mail stores `authorId` and `origin` after migration 0159. Manual messages, bulk sends and inbox replies preserve the member identity. Email outbox delivery records system or workflow origin, keeping the initiating member separately.

Historical canonical messages can recover attribution from an exact legacy message mapping, matching provider message ID, or the email outbox's exact generated message identity. A shared From address or signature is not sufficient evidence. Messages without reliable attribution display "Sender not recorded". A known member-origin message whose user was deleted displays "Workspace member · name unavailable".

## Call logs

Communication → Log call records a completed phone interaction or attempt. Choose a related application or general candidate follow-up, date and local time, direction, purpose, outcome and notes. Calls appear in Call history with the logging member and in candidate activity.

Calls use structured `candidate.call_logged` activity events, so existing candidate activity export and deletion apply. Creation requires candidate collaboration permission and, when linked, application collaboration permission. Reads enforce application visibility. The client supplies a stable event ID for retry deduplication.

Logging a call does not create an interview, change stage or send a message. This is a written call log, not audio recording.
