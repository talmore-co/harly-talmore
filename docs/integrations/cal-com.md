# Personal Cal.com scheduling

Each recruiter connects their own Cal.com account under **Account → Connections**. Workspace-admin access is not required. Google connections in Harly and in Cal.com are separate.

## Recruiter setup

1. Create a personal API key in Cal.com at **Settings → Developer → API keys**.
2. Paste the key into Harly's Cal.com connection card. Harly stores it encrypted and never sends it back to the browser.
3. Choose an existing personal interview event, or create a basic event with a name and duration.
4. Review the event's availability, connected calendars and meeting location in Cal.com. Preview the booking page before sharing it.
5. Click **Save event & configure sync**. Harly generates a signing secret and registers an event-specific webhook automatically.

The card reports webhook configuration separately from the last verified booking received. Loading event types tests the API connection, but does not prove webhook delivery.

Use single-host, non-seated interview events. This integration validates the connected recruiter as the booking's sole host. Cal.com controls candidate-bookable availability, including its treatment of busy calendar blocks. Harly's advisory Google conflict warnings do not change Cal.com's availability rules.

## Sharing a candidate link

In the candidate's scheduling panel, select the application and interviewer, then copy the self-scheduling link. Harly uses that interviewer's default event even when another recruiter copies the link. The link is copied, not emailed automatically.

The link contains a signed application reference valid for 90 days. Treat it as candidate-specific. Booking creation, rescheduling and cancellation are imported under the connected recruiter's identity. Cal.com sends invitations and creates meeting links; Harly does not create a second Google event or send a second invitation.

Bookings with missing, altered or expired references appear under **Bookings needing attention** in the connected recruiter's account. Harly can suggest applications sharing the attendee email, but a recruiter must choose the application. An application ID can be pasted when the booking email differs. Application permissions are checked before matching.

Imported interviews offer **Manage booking in Cal.com**. Rescheduling, cancellation and other booking edits happen there and sync back. Recruiters can mark an interview complete in Harly. If an external booking overlaps an existing Harly interview, Harly holds the import for attention in the booking inbox and preserves its application mapping. Resolve the time in Cal.com, then click **Retry booking sync**. Harly cannot undo a booking already accepted by Cal.com, so keep Cal.com's availability calendars current.

## Reconnect and disconnect

Reconnect with a key from the same Cal.com account. Account replacement is rejected so existing bookings cannot move to a different identity.

Changing the default event retains earlier event subscriptions for their existing bookings. Disconnect removes only Harly's own webhooks and clears the local API key. It does not cancel bookings. After reconnecting, save an event again to restore webhook subscriptions. If webhook removal fails, reconnect with a valid key and retry disconnecting.

Webhook setup reconciles subscriptions by their saved callback URL. A timeout after remote creation can be retried without creating a new subscription identity. Existing account-wide Harly webhooks skip personal event subscriptions and signed personal links.

## Deployment

- Apply the generated migration `0144_greedy_kid_colt.sql` with its snapshot and journal. It adds personal connection, event subscription and booking inbox tables, plus interview ownership columns. It follows the personal Google migration `0143`.
- Migrate before starting the updated app and scheduler. The schema changes are additive. An application rollback can retain the added tables, but disable personal webhooks before running an older application that cannot process them. Do not reverse or rewrite applied migrations.
- Use the existing server encryption configuration and public-origin configuration. No Cal.com-specific environment variables are needed.
- The public Harly origin must be reachable over HTTPS. Plain `localhost` cannot receive Cal.com webhooks; local end-to-end testing needs a development tunnel with the app's public origin configured accordingly.
- The endpoint is `POST /api/webhooks/cal/personal/<subscription-id>`. Keep it reachable without a staff login. It verifies the raw-body HMAC, limits request size, checks active membership and fetches the canonical booking with the recruiter's API key before importing it.
- Backups must include these tables and the existing encryption key. API keys and webhook signing secrets are sensitive database contents.

## Smoke test

Use fictional candidates and two user-controlled recruiter accounts.

1. Connect both accounts and select different events. Save twice and verify only one Harly webhook exists per event.
2. Copy a link for recruiter B while signed in as recruiter A. Book it and confirm B owns the imported interview and Cal.com sent only one invitation.
3. Give a candidate two job applications. Book an application-specific link and verify the intended job, not the most recent application, receives the interview.
4. Book the base event URL without a reference. Verify the booking needs manual matching.
5. Reschedule twice, then cancel. Verify the same interview is updated and repeated webhook deliveries do not duplicate it.
6. Change the default event and update an earlier booking. Verify the earlier subscription still works.
7. Disconnect and reconnect, then save the event again. Confirm webhook subscriptions recover.

Automated database coverage uses only the isolated local evaluation database:

```sh
cd apps/web
DOTENV_CONFIG_PATH=../../.env.local RUN_PERSONAL_CAL_INTEGRATION=1 node -r dotenv/config ./node_modules/vitest/vitest.mjs run src/lib/cal/ src/app/api/webhooks/cal/personal/
```

This test uses fictional records and mocked Cal.com responses. A real API-key and booking round trip is still required before production acceptance.
