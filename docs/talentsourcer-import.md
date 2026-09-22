# TalentSourcer AI candidate import

## Connection

An administrator with `integrations:manage` connects an organization-bound
TalentSourcer personal access token in **Settings → Integrations → TalentSourcer
AI**. Recommended minimal scopes are `projects:read`, `candidates:read`
and `campaigns:read`. Existing provider scope aliases are accepted. Credentials use the existing server encryption key and
never return to the browser. The provider origin is fixed to
`https://api.talentsourcer.ai`; redirects are rejected.

Each Talmore workspace can connect multiple TalentSourcer organizations. Add a
PAT for each organization; adding another token for the same organization
updates that connection. Replace token verifies that the token belongs to the
selected organization. Check connection and disconnect apply to one source
workspace. Disconnect removes its credential and invalidates only its previews;
imported candidates and other connections are retained.

## Import

In **Candidates → Import candidates → TalentSourcer AI**, select an open job,
an active pipeline stage, a connected TalentSourcer workspace, a source project,
and either a shortlist or a campaign
whose candidates have an `interested` reply disposition. Candidate and job
permissions apply on the server. The saved connection is shared with authorized
recruiters in the Talmore workspace.

Each preview loads at most 50 source rows with five concurrent profile requests.
Choose the rows to import, then use **Import selected**. **Next page** loads the
next source page. Source pagination is not a point-in-time snapshot, but each
preview freezes the displayed profiles for 30 minutes. Only previewed ready
rows can be submitted. Failed writes can be retried using the same preview.
Skipped export/access errors require a fresh preview after correction.

Imports are silent: no candidate email, booking invitation, conversion event or
application-created workflow is emitted. An `application.imported` activity,
stage history and an internal source-context note record the import. Source is
`talentsourcer`, distinct from CSV and hosted applications. Source interest is
stored as provenance, not a Talmore assessment or questionnaire score.

Identity resolution uses the source organization plus candidate ID, email and
normalized LinkedIn URL. Conflicting identities are skipped for manual review.
Existing profiles stay unchanged; an existing application keeps its stage.
Concurrent retries serialize and create at most one application and source note.
Candidate merges transfer external identity links through the existing merge
dependency handling.

## Candidates without email

The candidate email column is nullable. Missing email remains null rather than
a fabricated address. The profile displays **No email** and disables its email
composer. The edit drawer accepts an empty email and supports adding one later.
Bulk email skips missing addresses, booking links require email, signature
requests require email, and queued reminders/invitations recheck the recipient.
Public application and legacy CSV validation still require valid email.

Imports map profile name, headline, location, phone, LinkedIn, summary, skills,
employment history and education when present. One-part names are supported.
Private recruiter/resume context is kept in an internal source note. Binary
CVs and external assessment results are not imported by this version.

## Storage and rollout

Generated migrations 0164–0166 add encrypted connections, external identity
links and durable import previews/results, and make candidate email nullable.
Migration 0166 changes the connection primary key to Talmore workspace plus
TalentSourcer organization, preserving existing connections. Drizzle generated
a primary-key-name placeholder; it was resolved to the verified PostgreSQL
constraint name before the migration was first applied.
Use the standard migration-first rollout. No new environment variables.

Preview payloads are erased after expiry by the existing domain-events cron;
batch receipts expire after seven days. Imported candidate records and activity
history are independent of these temporary previews. Candidate erasure and
anonymization remove associated preview snapshots.

## Provider contract

The adapter lives in `apps/web/src/features/talentsourcer/client.ts`.

- `GET /api/v1/connection`: organization identity and scopes.
- `GET /api/v1/projects?limit=50&cursor=…`: `projects` envelope.
- `GET /api/v1/shortlists?projectId=…&limit=50&cursor=…`: `shortlists` envelope.
- `GET /api/v1/campaigns?projectId=…&limit=50&cursor=…`: `campaigns` envelope.
- `GET /api/v1/shortlists/{id}/candidates`: `page` envelope.
- `GET /api/v1/campaigns/{id}/candidates?replyDisposition=interested`: `page` envelope.
- `GET /api/v1/candidates/{id}/export`: organization-scoped profile, contacts and
  private context. `contacts.selectedEmail` is the provider-selected email.

All paginated envelopes include `continueCursor` and `isDone`. These contracts
were aligned with the TalentSourcer agent's local implementation; production
requires that implementation to be deployed and each live connection checked.

## Verification

`RUN_TALENTSOURCER_INTEGRATION=1` enables the database-backed import suite on
`127.0.0.1:55432/harly_talmore_eval`. Provider HTTP calls use fictional fixtures.
Unit tests cover named API envelopes, cursor handling, error redaction, LinkedIn
identity normalization and missing-email/name validation.
