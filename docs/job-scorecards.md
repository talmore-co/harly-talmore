# Job scorecards

The job editor's **Scorecard** section in the left navigation configures one scorecard per job, inline in the editor. Use **Save scorecard** to save up to 20 dimensions. Client and Role taken on are in Details. The right-hand live preview is the only public preview. Each dimension has a name, optional guidance and one rating format:

- Strong / Mixed / Weak
- 1–5, with a required description for every point on the scale
- Yes / No

Recruiters use **Evaluate → Fill out scorecard** for the selected application. Strong/Mixed/Weak and Yes/No use one-click choice cards; scales use five numbered buttons with anchor descriptions. Each dimension starts as **Not assessed**, distinct from a low rating or No, and has a Clear action and optional evidence/comments. A separate overall Strong/Mixed/Weak recommendation remains a recruiter decision; dimension ratings are not averaged. The Team ring counts overall recommendations.

Recording an interview with an assessment uses the same dimensions. Interview-linked scorecards remain on the interview and under their application's Team assessments. Each saved submission retains its author, time, application, stage and optional interview. Existing overall-only assessments remain readable. Jobs with no dimensions retain the simple recommendation/comments workflow.

Saved criteria contain version-1 snapshots of their name, guidance, rating format, all scale anchors, selected value and evidence. Editing or removing job dimensions does not rewrite completed scorecards. Submissions using an outdated definition are rejected and must be reopened. Job edits check the original definition to prevent silently overwriting another editor's changes. Saving assessments takes a shared job-row lock while validating and freezing the current definition.

Configuration requires job-scoped `jobs:edit`. Reading dimensions and submitting assessments requires application-scoped `collab:write`. The job definition is stripped from public job responses; criteria are not included in candidate portal interview responses.

Migration `0157` adds the private `jobs.scorecard_definition` JSON column. Existing jobs start with an empty definition. Completed dimensions use the existing `scorecards.criteria` column. Apply migrations before deploying the app; no new environment variables are needed.
