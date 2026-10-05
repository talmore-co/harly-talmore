# Recruit CRM candidate import

Connect an account at **Settings → Integrations → Recruit CRM** using an administrator's API token. Give the connection a recognizable name. Tokens are encrypted with the existing application encryption key and never returned to the browser. Check, replace and disconnect operate on individual saved accounts. A token replacement or disconnect invalidates existing previews and queued work for that connection.

The connector makes read-only requests to `https://api.recruitcrm.io/v1`. It uses a persisted source user ID as an account anchor, because the verified API does not expose a dedicated account-identity endpoint. Replacement tokens must return that same user. If that user is removed from Recruit CRM, verify the account before reconnecting; do not silently reinterpret its candidate identities as a different source.

## Recruiter workflow

1. Open **Candidates → Import candidates → Recruit CRM**.
2. Choose a Talmore job and active stage, or **Talent pool** without a job. Direct pool imports require unrestricted candidate access.
3. Select the source account. Search by name, email, LinkedIn, job title or location, optionally filtered by recruiter owner. Alternatively, browse candidates assigned to an old Recruit CRM job.
4. Choose whether to copy CVs and recruiter notes. CVs default on; notes default off.
5. Preview candidates and select rows. The preview shows email availability, existing matches, CV availability and contact restrictions. Shift-click supports range selection.
6. Choose **Fetch more** to append the next 25 candidates without losing your selection, **Import selected**, or **Import all matching candidates**. Import-all immediately queues background discovery and importing using the saved source filters, destination and CV/notes options. It includes unchecked and unloaded matching candidates. There is no second approval step and the browser can be closed immediately.
7. Reopen **Recent imports** to see full-batch counts of imported, skipped, failed and pending candidates, including whether source pages are still being fetched. The detailed list is limited to 100 rows for import-all. **Retry fetching** resumes a failed source page; **Retry failed candidates** retries failed/partial items across the whole batch. A partial result means the candidate was saved but its CV could not be copied; retrying transfers only the CV.

Job, account and owner pickers are searchable and alphabetical. Destination stages retain pipeline order. Source jobs load in pages of 100; candidate previews request 25 rows per page. Background discovery requests 100 candidates per source page. It starts at page one and deduplicates against the existing preview/import receipts, so switching to import-all after importing a selection is safe. Search filters are saved server-side; the source API remains a live paginated listing, not a point-in-time snapshot of the CRM.

## Import behavior

- Source identity is Talmore workspace + saved source connection + Recruit CRM candidate slug. Matching also uses email and normalized LinkedIn. Conflicting matches, deleted/anonymized matches and inaccessible matches require review.
- Existing candidate facts and existing application stages are preserved. New records receive profile/contact data, skills, work and education history. Candidates without email are supported.
- Custom-field names and values, original source and source job/stage are saved as internal source context. Optional notes retain the original author ID and date. They are not converted into assessments.
- Imports write `recruitcrm.imported` activity directly. They do not emit `application.created`, send candidate messages, trigger application-created workflows or send advertising conversions.
- Imported email opt-outs block workspace email delivery, including queued messages. Active off-limit restrictions also block outbound contact. Self-booking and new manual scheduling check restrictions. Candidate profiles show the restrictions and their reason. Imports and merges never clear an existing restriction.
- CV downloads use SSRF-checked HTTPS requests without forwarding the API token. Redirects are checked individually. PDF, DOC and DOCX files have a 10 MB limit and are copied to existing private workspace storage. File hashes and stable import receipts prevent duplicate attachments.

## Background execution and retention

The existing authenticated `domain-events` scheduler runs the importer. Each item has a persisted step and a five-minute recoverable lease. Source discovery also has a persisted page cursor and recoverable lease. Page receipts and cursor advancement commit atomically; overlapping workers and repeated clicks do not duplicate candidates. Empty non-final source pages advance the cursor. Workers recheck membership, destination access and connection revision. Browser, discovery and import requests share a conservative 45-request/minute budget per connection; provider 429 and temporary failures defer work. Candidate steps already in progress are prioritized over starting more profiles.

Previews expire after 30 minutes. Submission extends the batch to seven days for processing/retries. Expired source snapshots and downloaded-profile metadata are erased; receipts are removed after 30 days. Candidate erasure also removes related import items and source notes, including matching unsubmitted previews.

## Deployment

Migration `0167_large_speedball` adds the source connection, identity mapping, import batch and item tables, plus candidate contact-restriction fields. Migration `0168_mysterious_doorman` adds persisted discovery state. Previews created before this update must be recreated before using fetch-more or import-all because they did not save search filters. Apply migrations before starting the new application and scheduler. No additional environment variables are required. The existing private storage, encryption key and scheduler must be configured.

Checks use fictional data in `127.0.0.1:55432/harly_talmore_eval` and mocked provider requests. Enable `RUN_RECRUITCRM_INTEGRATION=1` for `src/features/recruitcrm/import.integration.test.ts`. Live validation so far covers read-only response contracts and a CV download header; no real candidate import was run by the agent.
