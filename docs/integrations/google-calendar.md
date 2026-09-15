---
title: "Google Calendar and Google Meet"
description: "Configure Google OAuth once, then let each recruiter connect their calendar in Account → Connections."
---

# Google Calendar and Google Meet

Harly uses Google OAuth to connect each recruiter's calendar. This is a two-part
setup:

1. The operator configures Harly's Google OAuth application credentials on the
   server.
2. Each workspace member connects their own Google account from
   **Account → Connections**. Administrator permissions are not required for
   personal connections.

The Google OAuth client credentials belong to the Harly installation. The
Google refresh token belongs to the connected member within that workspace. Never put the
client secret in browser code, commit it to Git, or ask candidates to provide
it.

## What this integration does

Google Calendar is used to:

- create, update, and cancel interview events;
- invite interview attendees;
- select a writable interview calendar and readable calendars for availability;
- create a Google Meet link when a video interview requests Google Meet.

Google Meet shares the assigned interviewer's OAuth connection with Google Calendar. It is not a
second credential or a separate candidate-portal integration.

OAuth is the authorization method; Harly still calls the Google Calendar API
with the OAuth access token. An API key cannot access a user's private calendar.

## 1. Create the Google OAuth application

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create or select a Google Cloud project for this Harly installation.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen.
4. Add the Google accounts that will test the app as test users if the app is
   still in **Testing** status.
5. Create an OAuth client with application type **Web application**.
6. Copy the client ID and client secret into the server environment.

For production, configure the consent screen and publishing status according
to Google's current OAuth requirements. OAuth clients in Testing can issue
refresh tokens that expire after seven days. See Google's [OAuth production
readiness guide](https://developers.google.com/identity/protocols/oauth2) for
the current rules.

## 2. Configure the server

For local development, add the values to `.env.local`. For a Docker or managed
deployment, add them to the private environment/secrets configuration of the
web service and scheduler where appropriate.

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Harly reads these values server-side. They are optional at startup, but the
Google Calendar and Google Meet Connect buttons remain disabled until both are
present.

Restart the web application after changing environment variables.

## 3. Register the redirect URI

The redirect URI must match the public Harly URL exactly. Add this URI to the
OAuth client in Google Cloud:

```text
http://localhost:3000/api/integrations/google/callback
```

For a production installation, replace the origin with `HARLY_URL`:

```text
https://harly.example.com/api/integrations/google/callback
```

Do not add a trailing slash, path prefix, or alternate hostname unless Harly is
actually served at that exact origin. A mismatch produces an OAuth callback
error before Harly can save the connection.

## 4. Connect each recruiter

After the server is configured:

1. Sign in as the recruiter in the intended workspace.
2. Open **Account → Connections**.
3. Select **Connect Google**.
4. Choose your Google account that owns or can edit the interview calendar.
5. Approve the requested Calendar permissions.
6. Use **Choose calendars / test connection**, select the interview calendar
   and calendars to check for availability, then save. The interview calendar
   is always included in availability checks.

The Google Meet integration uses the same connection. Connecting or
disconnecting Google Calendar also connects or disconnects Google Meet.

Harly stores the refresh token encrypted in a workspace/member-scoped connection row. The
browser only receives the OAuth redirect; it never receives the client secret
or the stored refresh token.

## Scheduling and ownership

- New interviews use the assigned interviewer's connection, even when another
  recruiter schedules on their behalf. An unconnected interviewer does not
  borrow the old workspace connection.
- Availability checks query that interviewer's selected calendars and Harly's
  interviews assigned to them. Different recruiters can interview concurrently.
  Google failures or missing connections produce a warning, not a claim of free
  time. External availability is advisory; Harly enforces its own overlapping
  interview checks separately.
- The AI assistant's scheduling preparation uses the assigned interviewer's
  Google connection and includes Google busy periods in its warnings. A calendar
  block reserved for interviews can be booked over after user confirmation;
  Google busy periods do not prevent booking.
- Each Google event keeps its connection ID and calendar ID. Changing calendar
  preferences only affects new events. Reassigning an existing interview changes
  its attendees but preserves the original Google organizer and calendar.
- Disconnecting clears that member's stored token. It does not cancel events or
  revoke other connections using the same Google grant. Reconnect the same Google
  account to resume updates. A different account cannot replace an existing
  personal connection's identity.
- Calendar creation, cancellation and rescheduling are driven by Harly. This
  change does not add ingestion of edits made directly in Google Calendar.
- Cal.com bookings without an assigned Harly interviewer cannot automatically
  use a personal Google connection. Their existing supplied meeting links remain
  usable; assign an interviewer before asking Harly to create a Google event.

## Upgrade and migration

Migration `0143_dashing_carmella_unuscione` adds personal connections and event
ownership columns. It is additive and does not move events or copy the old
workspace token to individual users. Every recruiter authorizes their own account.
No new environment variables or Google OAuth client are needed. The existing
callback URI is reused.

The old workspace connection remains in storage for legacy events. New Google
integration links lead to personal Connections, and their status reflects the
current member. Existing events without personal ownership continue using the
legacy connection. Preserve that legacy configuration if such events exist.

Apply migrations before starting the new application image. To recover from an
application deployment problem, retain the additive schema. Once personal events
exist, an older image cannot route their updates correctly; use a forward fix or
pause scheduling while recovering rather than running old calendar-sync code.

### Deployment smoke test

1. Have two recruiters connect different Google accounts through their personal
   Connections tabs. Check that each sees only their own account and calendars.
2. Schedule synthetic interviews for both recruiters at the same time. Confirm
   each event is on its assigned recruiter's calendar with its own Meet link.
3. Add an unrelated busy event to one recruiter's selected availability calendar.
   Confirm Harly warns for that recruiter without marking the other recruiter busy.
4. Reschedule an interview from another authorized recruiter's login. Confirm
   the original event changes and no duplicate invitation is created.
5. Disconnect the original host, verify sync reports a failure, reconnect the
   same account and retry sync. Finally cancel the test interviews in Harly and
   confirm their calendar events are cancelled.

## Candidate portal and Google login

This setup is separate from candidate-portal login. The candidate portal may
reuse `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as a fallback for Google
sign-in, but it requests only `openid email profile` and does not receive
Calendar access.

If a workspace has portal-specific Google OAuth credentials configured, those
credentials take precedence for portal login. They do not replace the
installation-level credentials used by Google Calendar and Google Meet.

## Troubleshooting

### "Credentials not set"

Check that both variables exist in the server environment used by the web
process:

```bash
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

Do not add them to a client-side `.env` file or expose them through
`NEXT_PUBLIC_*` variables. Restart Harly after changing them.

### `invalid_grant`

`invalid_grant` means Google rejected the stored refresh token. This can happen
even when nobody changed Harly's settings. Common causes include:

- the user revoked Harly in Google Account permissions;
- the OAuth app is in Testing and the refresh token expired;
- the Google Cloud OAuth client or project changed;
- the account or Workspace administrator revoked the grant;
- too many refresh tokens were issued for the same Google account and OAuth
  client.

Fix it from **Account → Connections**:

1. Disconnect the stale connection if it is still shown.
2. Connect Google again.
3. Authorize the same calendar account.
4. Run **Test connection**.

Harly invalidates a rejected token and keeps the local interview record safe,
but it cannot revive a token that Google has already revoked. Reconnecting is
required. Existing interviews that were saved while Calendar was unavailable
may need an explicit resync or reschedule to create their external event.

### `redirect_uri_mismatch`

Compare the URI in Google Cloud with the exact value derived from `HARLY_URL`:

```text
<HARLY_URL>/api/integrations/google/callback
```

Check protocol, hostname, port, and trailing slash. Localhost and production
are different redirect URIs and both must be registered if both environments
are used.

### No refresh token received

Revoke Harly from [Google Account third-party access](https://myaccount.google.com/permissions),
then start the connection again. Harly requests offline access and consent so
Google can return a refresh token.
