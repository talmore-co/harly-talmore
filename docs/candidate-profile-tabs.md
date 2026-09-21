# Candidate profile tabs

- **Profile** shows contact details first in the Details panel, followed by the
  résumé, summaries, experience, education and skills.
- **Applications** contains the candidate's applications, including client, job, status,
  stage, date, source, questionnaire score, AI fit and submitted answers.
  Rows reuse the pipeline's score rings and Meta attribution indicator.
  Questionnaire answers, scoring details, source attribution and the AI
  evaluation expand under their own application. Each application links to
  its job's pipeline. The Profile tab has no application evaluation summary.
  The Source disclosure trigger sits beside AI evaluation in the row's actions.
- **Notes & activity** contains the full notes and comments followed by the
  activity timeline. Its existing `tab=activity` URL remains valid.

The Applications tab uses `tab=applications`. Switching tabs preserves the
selected `applicationId` and other query parameters. The right sidebar's tasks
continue to follow that selected application.

Interview links from the dashboard and calendar open `tab=interviews` with the
interview's application selected. Google Calendar links use the same event-search
URL across the dashboard, calendar details and candidate interview cards.
## Application-specific assessments

Team assessments expand under their application on the Applications tab, alongside answers, AI evaluation and Source. There is no separate Evaluation tab. Old `tab=evaluation` links open Applications and preserve application context.

Application rows and pipeline list/board cards share a Team assessment ring beside Questionnaire and AI fit. Its center shows the assessment count; green, amber and red segments show the Strong/Mixed/Weak distribution. The tooltip shows the labeled breakdown on hover or keyboard focus. Empty rings show a dash. Each saved assessment counts once, including interview-linked assessments. Counts are scoped to the application and workspace, and are not averaged into a fit score.

AI evaluations and team assessments are matched by application ID. Each row shows its own team-assessment count and Add assessment action. Legacy assessments without an application are not attributed to an arbitrary role.

The top Evaluate action opens a drawer with an application selector defaulting to the current application. Switching applications clears the draft ratings and comments. The selector is fixed for assessments opened from a specific application row or interview. Every option identifies the job and client. Saved assessments show the job/client and stage, plus the linked interview when available. The server validates application access and records its current stage when no explicit stage is supplied. Job-defined scorecard dimensions replace the old Suggest attributes control; Refine with AI remains available for comments.
