# Personal Fathom recordings

Fathom sends meeting content to Harly through a signed webhook. Harly imports only recordings that unambiguously match an existing interview assigned to the connected recruiter. Unmatched meetings are acknowledged and discarded. They create no inbox, candidate, interview, note, notification, or stored payload.

## Setup

1. Generate a personal API key in [Fathom API Access settings](https://fathom.video/customize#api-access-header).
2. Open **Account → Connections → Fathom**, paste the key and click **Connect Fathom**.
3. Harly creates the webhook automatically, subscribes to your own recordings and your own recordings shared with your team, and enables summaries and transcripts.

Harly encrypts both the API key and the generated webhook signing secret with the existing `AI_ENCRYPTION_KEY`. The key remains server-side for webhook cleanup. No manual callback URL or secret setup is needed. Fathom must already be configured to record the recruiter's calls. The first matched recording supplies the Fathom account email shown on the connection card; it can differ from the Harly login.

## Matching

All conditions must hold:

- The connection owner is an active member of the same workspace and the assigned interviewer.
- The webhook was registered for the key owner's own recordings. After the first import, the recorder email must continue to match that account.
- The underlying meeting URL matches the interview's meeting link or URL-valued location.
- Fathom's scheduled start is within five minutes of Harly's scheduled start.
- The candidate's email appears among Fathom's calendar invitees.
- Exactly one interview matches. Canceled interviews and trashed candidates/jobs are excluded.

Google Meet room codes and Zoom meeting IDs ignore tracking/password parameters. Teams meetup paths ignore their context parameters. Other URLs require an exact match apart from the fragment. Recurring rooms still require the scheduled time and participant match.

Interviews booked through the personal Cal.com integration qualify once the booking has imported into Harly. Calls without a meeting URL, unmatched calls, and ambiguous calls are ignored. There is no email-only fallback or retroactive matching. A webhook that arrives before the interview exists is ignored too.

## Candidate profile

Matched interviews show **View Fathom recording and notes**. Loading content enforces interview/job-scoped candidate-view permissions. Summaries are labelled as Fathom-generated; transcripts retain speaker names and timestamps. Recordings remain hosted in Fathom and use Fathom's access permissions. Raw HTML and remote images in summaries are not rendered.

Imports never change interview status, candidate stage, evaluation scores, or email invitations. A workspace/provider/recording ID constraint makes repeated delivery idempotent. The first import is preserved, including its interview assignment. Subsequent deliveries do not overwrite it.

Disconnect stops imports, removes only the webhook Harly registered, then clears the stored API key. If remote cleanup fails, imports stay stopped and **Retry disconnect** finishes removal. If the API key was revoked, remove the webhook in Fathom and use the recovery option to clear the connection. Previously imported content remains attached to its interview; permanently deleting the interview, application or candidate cascades to recordings. Trash hides content and prevents new imports.

Harly persists a registration reservation before calling Fathom and locks the connection through registration and saving. Repeated successful connects reuse the connection. Definite API rejections allow retry. If a network failure or process crash leaves webhook creation uncertain, Harly does not blindly create another hook. Fathom's documented API has no webhook-list endpoint to reconcile that case. The connection card shows the destination URL for removing any partially created webhook in Fathom, then resetting setup. This recovery flow appears only for an incomplete registration.

## Deployment and verification

Apply both generated additive migrations, `0145_pink_ezekiel` and `0146_round_titania`, before starting the new app. They add personal connections, automatic webhook setup fields, and interview recordings. No new environment variable, worker, external queue, API subscription to Harly, or video storage is required. Use a public HTTPS Harly origin for live Fathom callbacks. The older application can run with these extra tables left in place; rollback should not remove the migrations.

Webhook signatures use HMAC SHA-256 with five-minute timestamp tolerance. Bodies are bounded to 4 MiB. Database failures return 503 for delivery retry; ignored meetings return 200. No webhook body or signing secret is logged or retained for ignored meetings.

For local integration tests, use the isolated evaluation database and `RUN_FATHOM_INTEGRATION=1`. Test payloads and credentials are fictional. A live smoke test should schedule one Harly video interview with matching invitees, then record the call in Fathom. Verify the link, summary and transcript appear once. Record an unrelated meeting and confirm it creates nothing. Also test disconnect and repeated delivery.

References: [webhook setup and verification](https://developers.fathom.ai/webhooks), [meeting payload](https://developers.fathom.ai/api-reference/webhook-payloads/new-meeting-content-ready).
