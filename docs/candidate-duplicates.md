# Candidate duplicate review

Candidate profiles show **Review possible duplicates** when another active,
non-anonymized candidate in the same workspace has the same trimmed full name,
email, normalized phone number, or LinkedIn URL. A shared first or last name alone
does not trigger the banner. Up to 20 possible matches appear per profile.

Review requires workspace-wide candidate access. Assigned-job, department and
region restrictions prevent access to this workspace-wide comparison. Merging
and dismissing also require candidate view, edit and delete permissions.

## Review and merge

1. Open the comparison and choose the primary profile.
2. Compare the contact details, skills, experience and education. Choose which
   conflicting profile fields to retain. Null primary fields default to the
   other record. Skills, education and experience arrays are combined, removing
   identical entries.
3. For every shared job, choose the application to retain. The comparison shows
   stage, status, questionnaire score, AI score, hire information and submitted
   answers. The selected application keeps its current values and complete
   answers/evaluation, including unanswered or unscored results.
4. Confirm that both profiles belong to the same person, then merge.

**Different people · dismiss** saves a symmetric workspace decision. It removes
the pair from subsequent banner and AI searches. AI assessment is optional and
uses the existing configured AI provider; it cannot merge or dismiss records.
The manual assessment checks the selected pair rather than an unrelated batch.

The merge moves applications from other jobs, notes, files, communication,
interviews, offers, tasks, consent records and other candidate-linked rows. It
also moves document associations and reusable candidate signatures. Shared-job
application histories and related records are combined. Conflicting answers,
evaluations, demographics, tags and referrals are preserved in the audit before
resolving their uniqueness constraints. Current demographics prefer the primary
record. Tag deduplication is case-insensitive. A second active talent-pool entry
becomes historical.

No new email or stage transition is generated. Pending email payloads follow
the retained IDs. Merging waits until active email processing or queued/running
AI evaluations finish, and refuses candidates with unfinished deletion requests.
The transaction locks the two candidate records, their applications and existing
dependent rows. Activity, document associations, pending email and saved
signatures use brief table locks because their candidate references have no
foreign keys. These locks fail immediately on contention; the entire transaction
retries up to three times with backoff. Other locks time out after five seconds,
and each database statement has a ten-second limit.
A changed profile, application, answer or evaluation invalidates the preview.
Concurrent/repeated submissions cannot merge the same source twice.

## History and links

The primary profile has a merge activity and **View merge history**. It retains
the original profile and application values, reviewer, timestamp and choices.
The dialog exposes original profile/application values and answers; sensitive
demographics remain in the server-side audit.

Old dashboard candidate/application links redirect to their retained records,
including after another merge. Existing reply-email tokens and signed Cal.com
booking references resolve to the retained application. Offers and interview
records keep their IDs. Previously issued documents and messages keep their
original content.

Both profiles' candidate-portal sessions and unused magic links are invalidated.
The selected email remains the primary contact/login email. Other original
emails are retained in the audit, not registered as alternate portal logins.
Future intake through a different email can still create a new candidate.

Merge audits follow the retained candidate on another merge, are deleted with
that candidate, and have their personal contents cleared during retention
anonymization. There is no one-click undo; recovery uses the audit and, if needed,
the operator's database backup.

## Deployment and verification

Migration `0155_round_venus.sql` adds merge redirects/audits and duplicate
dismissals. It also makes the existing application-context foreign keys cascade
candidate-ID updates for offers, client offers and interviews. Existing rows
are not merged or rescored by the migration. Run the normal migration service
before starting the new app image. No new environment variables are needed.

The migration is additive. Rolling back application code leaves the audit and
redirect tables intact, but older code cannot follow redirects after a merge.

Integration tests use fictional records in `harly_talmore_eval`:

```sh
cd apps/web
DOTENV_CONFIG_PATH=../../.env.local RUN_MERGE_INTEGRATION=1 \
  node -r dotenv/config node_modules/vitest/vitest.mjs run \
  src/features/candidates/merge.integration.test.ts
```
