# Placements

Recruiting → Placements lists placement records across accessible jobs. Access
requires `candidates:view`; assignment, department and region restrictions apply
to records and filter options. Trashed jobs and candidates are excluded. Closed
jobs remain included.

One row represents one application with an explicit hire date, a historical
Hired transition, or a current Hired status. The date is the explicit hire date,
otherwise the first Hired transition's UTC date. A legacy Hired application with
neither has an unknown date. Reopening retains the historical placement and the
list separately shows the current application status.

Search covers candidate, client, job and terms. Filters cover client, job,
application status and inclusive hire dates. Unknown dates are excluded when a
date boundary is selected. The default order is newest hire date first, unknown
dates last. Clients reflect current job-client assignments.

View opens the exact application's Offers & hire tab for review or editing.
New placements are created from that application tab. No schema migration or
new placement table is needed.
