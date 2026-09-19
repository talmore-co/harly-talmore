# Agency reports

Reports has Overview, Clients & jobs, and Sources tabs. Date, client, job and
waiting-time filters are URL-backed and survive tab changes. CSV exports use the
same filtered data; counts open application details with a separate record export.

## Dates and activity

Dates are inclusive UTC calendar dates, shown next to the filters. Presets include
30/90/365 days, this month and last month. Custom periods must end today or earlier
and span at most two years. Daily/weekly/monthly trend buckets adapt to the range.

- Applications: application date in the period, not unique people.
- Submissions: first recorded entry into a stage named Submitted, once per application.
- Placements confirmed: explicit hire date, otherwise first Hired transition.
  These are confirmation dates, not employment starts. Reopening does not erase a
  historical hire event. A placement needs neither an offer nor a submission.
- Client offers: actual client-offer records, using their offer date. Multiple
  records for one application count separately in delivery reporting.
- Offer acceptance: accepted / (accepted + declined), across client offers and
  Talmore offers with a decision date in the period. No date means exclusion.
- Application/submission to placement: median calendar days for placements in the
  period with valid known start dates. Same-day placements count as zero days.

Period activity totals can involve different applications. They are not a
conversion funnel. Historical stage names are resolved through existing stage
records; missing history is not reconstructed.

## Current state and cohorts

Current pipeline and aging deliberately ignore the date range. They show active
applications on open jobs matching the job/client filters as of today. Applied
means no stage move yet, regardless of AI or questionnaire scoring.

Age starts at the latest transition matching the current stage. With no history,
only Applied can use the application date. Other missing ages remain unknown.
Completed stays measure elapsed time between consecutive transitions whose exit
falls in the period. Repeat visits count separately. Current waiting time and
completed stays have separate columns. The oldest list shows at most 20 records.

Application outcomes select applications received in the period and show their
current statuses. Submission outcomes select first submissions in the period.
Unknown historic rejection sources stay unknown.

## Source quality

Sources select applications received in the period, then show outcomes recorded
as of today. Submission, client-offer and placement columns count each application
once. Placement conversion is ever-placed applications / cohort applications;
it can differ from the current Placed outcome after reopening.

Use latest saved attribution, including campaign name and ID. Saved attribution
does not expire for reporting. It is visitor-provided, not provider-verified.
Import/referral source is a fallback; untagged public applications are unknown.
Questionnaire qualification uses the submitted version-1 snapshot and its saved
threshold/result, never today's configuration. No threshold/result means unknown.
It is separate from AI fit and recruiter assessment. No spend or cost metrics.

## Clients and access

All client grouping uses the job's **current client assignment**, including past
activity. Relinking changes the report grouping. The UI and CSV state this; there
is no frozen placement-client field yet. Client-offer records retain their own
original client identity and remain accessible through candidate offer details.

Reports requires reports:read. Job assignment, department and region restrictions
apply to data and filter options. Deleted jobs/candidates are excluded, while
closed and draft jobs remain available for period reporting. Current aging only
includes open jobs. CSV values use the shared formula-injection protection.

## Role approval to first submission

The private job-editor **Role taken on** date means the client approved Talmore
to start recruiting. It is saved separately with job-edit permission and is
excluded from public job payloads. Dates must be valid and no later than today
in UTC. Clearing the field restores unknown status. Creating, publishing or
reopening a job does not populate or reset it.

The first-submission cohort selects roles by approval date in the report period,
then finds the earliest recorded Submitted entry across their applications as
of today. Each role contributes at most once. Median time uses calendar days;
same-day submissions are zero. Submissions before the entered approval date are
flagged and excluded from the median, rather than replaced with a later one.

Overview also lists unclosed roles still awaiting their first submission across all
approval dates within the client/job filters. It includes approved draft jobs and
roles with no applicants, so delays before publication are still visible.
Missing approval dates remain unknown and their coverage count is shown separately.
Clients & jobs contains the dated role cohort. Both tables and the median/sample
counts are exported. The existing exclusion of trashed candidates/jobs applies
to submission history too.

Migration `0154_numerous_the_executioner.sql` adds nullable `jobs.taken_on`.
There is no historical backfill, and no new environment variables. Apply the
migration before deploying the app. Older code can ignore this additive column.
