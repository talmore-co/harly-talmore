# Record completed interviews

On a candidate's **Interviews** tab, choose **Record interview** to document a call or interview that already happened.

- Application defaults to the application selected on the candidate profile.
- Type defaults to Screening, method to Phone, date/time to now and interviewer to the current workspace member.
- Dates use the shared date picker. Time uses the browser's displayed time zone and cannot be in the future.
- Internal notes are separate from invitation messages. An optional Strong/Mixed/Weak assessment and comments belong to both the interview and its application.
- Saving creates a completed interview and an activity entry. It sends no email, portal notification or calendar invitation, and does not move the application stage.
- Notes and linked assessments appear on the interview card. Assessments also appear under the relevant application's Team assessments disclosure. Evaluate on a card attaches subsequent feedback to that interview.
- Candidate portal responses exclude internal notes and assessments.
- Recording requires job-scoped `interviews:manage`; adding an assessment also requires `collab:write`. Interviewers must belong to the workspace.
- Retrying the same dialog submission does not create a duplicate interview or assessment.

Migration `0156` adds `interviews.internal_notes` and the optional indexed `scorecards.interview_id` foreign key. Apply the migration before deploying the updated app. No new environment variables are required.
