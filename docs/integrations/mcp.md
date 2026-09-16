# Harly MCP connector

Harly exposes a remote Streamable HTTP MCP endpoint at `/api/mcp`. Recruiters
authorize an assistant through their existing Harly account. The connector uses
the recruiter's current workspace membership and permissions on every request.

## Connect

1. In Claude or ChatGPT, add a custom remote MCP connector with the URL
   `https://<your-harly-host>/api/mcp`.
2. Sign in to Harly, select your workspace if needed, and allow the requested
   access. Availability of custom connectors depends on your client plan and
   administrator settings.
3. Manage or revoke access under **Account → Connections → AI assistants**.

Use the same canonical public origin as Harly's Google login. The connector
needs no separate service, workspace API key, or Google credential sharing.

## Tools

- `search_candidates`, `get_candidate`
- `list_jobs`, `get_pipeline`
- `create_candidate`, `add_candidate_to_pipeline`
- `get_candidate_notes`, `add_candidate_note`
- `move_application_stage`
- `list_candidate_interviews`, `get_interview_recordings`
- `create_draft_job`, `get_job_questionnaire`, `set_job_questionnaire`

For example: "Find Jordan Example by email. If they aren't already in Harly,
create their candidate profile, then add them to the open Support Specialist
pipeline."

Candidate creation and assignment are separate writes. If assignment fails,
the candidate remains available in Harly. Duplicate emails and applications
are rejected. Assignment starts at the first stage and uses Referral for a
matching job-specific referral, otherwise Manual. Creating a standalone
candidate requires workspace-wide candidate access.

The connector reuses the existing recruiting services and their domain events.
Creation, assignment and stage tools do not directly send candidate email.
Existing workspace automation and outgoing webhook behavior still applies.
Notes and imported transcripts are untrusted data, not assistant instructions.
The notes tool creates a new note for each call; clients must not blindly retry
it after an uncertain response.

## Authorization

- Authorization code flow with PKCE, using Better Auth OAuth Provider 1.6.23.
- Dynamic client registration supports clients that discover and register
  themselves. Client ID Metadata Documents are not implemented in this version.
- `harly:read` exposes read tools; `harly:write` exposes write tools.
- `offline_access` allows refresh tokens. Access tokens expire after 15 minutes;
  refresh tokens expire after 30 days. The originating Harly session must also
  remain valid, so logging out or revoking that session ends connector access.
- Opaque tokens are hashed in storage and checked against the active consent,
  client, user, session and membership. Google access tokens are never exposed.
- Forced password changes, required second-factor setup, required passkeys,
  allowed email domains and workspace IP allowlists also apply. An IP allowlist
  checks the assistant server's incoming request address.
- Revoking access removes that user's consent and tokens for the selected
  client and workspace, including pending authorization codes. A database
  advisory lock serializes issuance and revocation across application replicas.

The 1.6 OAuth provider has a published resource-binding advisory. This connector
uses the documented single-audience workaround and validates the resource at
both authorization and token exchange. It issues only opaque Harly MCP tokens.
Do not add other audiences without upgrading the provider and its schema.

Discovery endpoints:

```text
/.well-known/oauth-protected-resource/api/mcp
/.well-known/oauth-authorization-server/api/auth
```

The transport is stateless and uses JSON responses. POST is supported; persistent
SSE sessions are not needed. Requests are limited to 256 KiB.

## Deployment and checks

Run the generated OAuth-table migration before starting the new application
image, using Harly's existing migration service. App and migration services must
use the same image. Keep `BETTER_AUTH_SECRET` stable.

Local integration tests use the isolated evaluation database:

```sh
cd apps/web
DOTENV_CONFIG_PATH=../../.env.local RUN_MCP_INTEGRATION=1 \
  node -r dotenv/config ./node_modules/vitest/vitest.mjs run src/server/mcp/mcp.integration.test.ts
```

Before recruiter rollout, test authorization, tool discovery, candidate creation,
pipeline assignment and revocation from both Claude and ChatGPT against the
deployed HTTPS endpoint. Local protocol tests do not establish client-specific
compatibility.
