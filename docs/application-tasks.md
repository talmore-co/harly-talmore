# Application tasks

The candidate profile shows an Open tasks card above Activity in the right
sidebar for staff with `tasks:read`. It follows the current application, without
a separate job dropdown or Tasks tab. Candidate-only and
unlinked tasks remain in the global Tasks page.

Staff with `tasks:write` can create, edit, complete and reopen tasks here. Creation
prefills the current user as assignee and links the candidate, application and
job. Those links stay fixed in the application dialog. Completed and canceled
tasks appear in a collapsed history. Existing task records are reused; there is
no migration or automatic task creation.

The selected application is stored in the URL. Application-linked
tasks on Home and in the global list/board link to that application’s task card.
The candidate action bar uses the same application selection, so switching the
application also updates the tasks shown in the sidebar.
Application reads and create/update actions check application access as well as
task permissions. The application page only loads tasks for visible applications.
