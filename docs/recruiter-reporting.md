# Recruiter reporting and setup

The Recruiters tab in Reports uses the existing period, client, job and permission filters. Its CSV export contains the displayed recruiter metrics.

- Assigned jobs are current hiring-team assignments, shared across teammates.
- Completed interviews belong to the assigned interviewer and use the scheduled interview date.
- Assessments count application-linked scorecards by author and creation date.
- Completed tasks use completion date and the task's current owner. Overdue tasks are current pending or in-progress job-linked tasks due before today, using UTC dates.
- First submissions and hires count the earliest recorded entry into Submitted or Hired for each application. The member who recorded the transition receives the count. These are recorded actions, not individual placement credit. Automation can record actions under its creator.
- Missing assessments are completed interviews in the period without an interview-linked scorecard by the assigned interviewer. Each entry links to the application for review. An application-only scorecard does not silently satisfy an interview-specific assessment.

The report excludes deleted and anonymized candidates. It does not infer conversion rates from unrelated activity counts or grade the factual accuracy of notes. With unrestricted, unfiltered workspace access, members with no activity also appear so managers can identify setup or adoption gaps.

Team & access shows saved Cal.com, Google Calendar and Fathom setup states to members with `members:read`. This is the recruiting Google connection, not Google sign-in. Cal.com requires an enabled credential, default event and webhook. Google requires an enabled calendar connection and refresh credential. Fathom requires completed webhook setup. These indicators do not run live provider health checks or expose credentials. Recruiters manage their connections under Account → Connections.

Job compensation and offer forms use the shared searchable currency picker. Search matches currency codes and English names, including PHP / Philippine peso and CAD / Canadian dollar. Values remain ISO currency codes; choosing a currency does not convert an amount.
