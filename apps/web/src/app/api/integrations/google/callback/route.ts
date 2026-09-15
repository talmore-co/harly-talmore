import { NextResponse, type NextRequest } from "next/server";

import { eq } from "drizzle-orm";
import { db, personalGoogleConnections, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createOAuth2Client } from "@/lib/gcal/config";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  verifyAndConsumeOauthStateNonce,
  verifySignedState,
} from "@/server/oauth-state";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { listCalendars } from "@/lib/gcal/client";

export const runtime = "nodejs";

/**
 * GET /api/integrations/google/callback?code=...&state=...
 *
 * Google redirects here after consent. We exchange the code for tokens,
 * encrypt the refresh token, fetch the user's email, and store everything.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return redirectWithError("Unauthorized. Please log in first.");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const personal = Boolean(state && verifySignedState(state)?.p === "google-personal");
  const fail = (message: string) => redirectWithError(message, personal);

  if (error) {
    return fail("Google Calendar access was not granted.");
  }

  if (!code || !state) {
    return fail("Missing code or state from Google.");
  }

  // Verify the server-side nonce: single-use, TTL-scoped, bound to the user +
  // workspace that started the install. This replaces the old CSRF-only state
  // check and closes replay/escalation on the integration OAuth flow.
  const actor = session.session;
  const userId = session.user.id;
  const workspaceId = actor.activeOrganizationId;
  if (!workspaceId) {
    return fail("No workspace available for this account.");
  }

  const nonceCheck = await verifyAndConsumeOauthStateNonce({
    state,
    userId,
    workspaceId,
    provider: personal ? "google-personal" : "google",
  });
  if (!nonceCheck.ok) {
    return fail(`${nonceCheck.error} Please try again.`);
  }

  const context = await getWorkspaceContextOrNull();
  if (!context || context.organization.id !== workspaceId || context.user.id !== userId) {
    return fail("Workspace membership is required.");
  }
  if (!personal) await requirePermission("integrations:manage");

  const wsId = nonceCheck.workspaceId;

  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    return fail("Google OAuth credentials not configured.");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return fail("No refresh token received. Try connecting Google again and approve calendar access.");
    }
    oauth2Client.setCredentials(tokens);
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    let accountEmail: string | null = null;
    if (res.ok) {
      const info = (await res.json()) as { email?: string };
      accountEmail = info.email?.toLowerCase() ?? null;
    }
    const encrypted = encryptSecret(tokens.refresh_token);

    if (personal) {
      if (!accountEmail) return fail("Could not identify your Google account. Try connecting again.");
      const calendars = await listCalendars(oauth2Client);
      const primary = calendars.find((calendar) => calendar.primary) ?? calendars[0];
      if (!primary) return fail("This Google account has no writable calendar.");
      const credentials = {
        enabled: true,
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenTag: encrypted.tag,
        updatedAt: new Date(),
      };
      // Atomic identity guard: concurrent callbacks cannot swap the account
      // behind a connection ID already referenced by calendar events.
      const saved = await db.insert(personalGoogleConnections)
        .values({
          workspaceId: wsId, userId, accountEmail,
          calendarId: primary.id, availabilityCalendarIds: [primary.id],
          ...credentials,
        })
        .onConflictDoUpdate({
          target: [personalGoogleConnections.workspaceId, personalGoogleConnections.userId],
          set: credentials,
          setWhere: eq(personalGoogleConnections.accountEmail, accountEmail),
        })
        .returning({ id: personalGoogleConnections.id });
      if (saved.length !== 1) return fail("Reconnect the same Google account previously linked to your profile.");
      return NextResponse.redirect(`${getAppUrl()}/account?tab=connections&gcal=connected`);
    }

    const set: Partial<typeof workspaceSettings.$inferInsert> = {
      gcalEnabled: true,
      gcalAccountEmail: accountEmail,
      gcalCalendarId: "primary",
      gcalRefreshTokenCiphertext: encrypted.ciphertext,
      gcalRefreshTokenIv: encrypted.iv,
      gcalRefreshTokenTag: encrypted.tag,
      updatedAt: new Date(),
    };

    await db
      .insert(workspaceSettings)
      .values({ organizationId: wsId, ...set })
      .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

    return NextResponse.redirect(`${getAppUrl()}/settings/integrations?gcal=connected`);
  } catch {
    return fail("Could not connect Google Calendar. Please try again.");
  }
}

function getAppUrl(): string {
  return getHarlyPublicOrigin();
}

function redirectWithError(msg: string, personal = false) {
  const url = new URL(`${getAppUrl()}${personal ? "/account?tab=connections" : "/settings/integrations"}`);
  url.searchParams.set("gcal_error", msg);
  return NextResponse.redirect(url.toString());
}
