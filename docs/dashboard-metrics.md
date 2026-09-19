# Dashboard team metrics

The top row is a team overview, not a personal assignment queue. Counts are
database aggregates, independent of the preview lists below and the selected
job in the pipeline overview widget.

- **New applications**: active applications to open, non-deleted jobs,
  with non-deleted candidates, in a stage named Applied. AI evaluations and questionnaire scores do not remove an
  application from this queue. Moving it to another stage does.
- **Conversations needing a reply**: open inbox threads whose latest message
  is incoming. Archived threads, outbound-only receipts and threads linked to
  deleted candidates are excluded. Unlinked senders are included. This counts
  conversations, not people, and does not impose a response deadline.
- **Interviews today**: all non-canceled workspace interviews within the
  recruiter's local calendar day, excluding deleted candidates/jobs. Completed
  interviews remain part of today's schedule. Invalid/missing timezone
  preferences use UTC. PostgreSQL timezone-aware midnight boundaries handle
  daylight-saving changes; display times use the same timezone.
- **Active applications**: active applications across all open, non-deleted
  jobs with non-deleted candidates. A person applying to two jobs counts twice.

The New applications card opens the existing pipeline with `jobId=all&stage=Applied`.
The Active applications card opens `jobId=all`, with the All stage tab selected.
All open jobs shows active applications across open jobs, with a visible scope label.
The existing stage tabs update the URL and support refresh and back navigation.
There is no additional application-filter dropdown.
List sorting defaults to newest applications first, with oldest first,
questionnaire score and AI fit options. Manual pipeline order is available only
on the board. The list toolbar puts search, sorting, score thresholds, attribution
and export in a single wrapping row.
Cross-job results use the existing list, with job labels and job-specific stages.
Select a single job for the board or bulk AI evaluation. Bulk stage moves require
applications from one job. The reply card opens the existing Needs
reply inbox filter. The interview card opens a dated team agenda under
`/dashboard/calendars?day=YYYY-MM-DD`, using the saved recruiter timezone.

The greeting uses the full screening and reply totals. Recruiting follow-ups
and team reviews below remain limited previews, and are not email counts.
Scorecards only clear reviews for the matching application and stage. The
selected-job pipeline overview remains a separate job-specific widget.

Verification includes >50 applications across multiple jobs, incoming versus
outgoing threads, closed jobs, deleted candidates, rejected applications,
cross-job scorecards, local midnight boundaries, canceled interviews and a
23-hour daylight-saving day. No schema migration is required.
