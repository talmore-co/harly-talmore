import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  db,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  member,
  organization,
  user,
  session,
  workspaceSettings,
  passkeys,
} from "@harly/db";
import { hashMcpToken, MCP_TOKEN_PREFIX } from "@harly/auth/mcp-oauth";
import type { WorkspaceContext } from "@/features/workspaces/context";
import { normalizeWorkspaceRole } from "@/features/workspaces/roles";
import {
  getTrustedClientIp,
  isEmailDomainAllowed,
  isIpAllowed,
} from "@/server/security/policy";

export type McpActor = {
  context: WorkspaceContext;
  scopes: string[];
  clientId: string;
  consentId: string;
  tokenId: string;
};

export async function authenticateMcp(
  request: Request,
): Promise<McpActor | null> {
  const value = request.headers.get("authorization");
  if (!value?.startsWith(`Bearer ${MCP_TOKEN_PREFIX}`) || value.length > 2048)
    return null;
  const token = value.slice(7 + MCP_TOKEN_PREFIX.length);
  const [result] = await db
    .select({
      access: oauthAccessToken,
      user,
      session,
      organization,
      membership: member,
      consent: oauthConsent,
      settings: workspaceSettings,
    })
    .from(oauthAccessToken)
    .innerJoin(
      oauthClient,
      and(
        eq(oauthClient.clientId, oauthAccessToken.clientId),
        or(eq(oauthClient.disabled, false), isNull(oauthClient.disabled)),
      ),
    )
    .innerJoin(user, eq(user.id, oauthAccessToken.userId))
    .innerJoin(
      session,
      and(
        eq(session.id, oauthAccessToken.sessionId),
        eq(session.userId, oauthAccessToken.userId),
        gt(session.expiresAt, new Date()),
      ),
    )
    .innerJoin(organization, eq(organization.id, oauthAccessToken.referenceId))
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, user.id),
        eq(member.status, "active"),
      ),
    )
    .innerJoin(
      oauthConsent,
      and(
        eq(oauthConsent.clientId, oauthAccessToken.clientId),
        eq(oauthConsent.userId, user.id),
        eq(oauthConsent.referenceId, organization.id),
      ),
    )
    .where(
      and(
        eq(oauthAccessToken.token, hashMcpToken(token)),
        gt(oauthAccessToken.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!result) return null;
  if (result.user.mustChangePassword) return null;
  const settings = result.settings;
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  if (
    !isEmailDomainAllowed(
      result.user.email,
      strings(settings?.securityAllowedDomains),
    )
  )
    return null;
  if (
    !isIpAllowed(
      getTrustedClientIp(request),
      strings(settings?.securityIpAllowlist),
    )
  )
    return null;
  if (
    settings?.securityRequirePasskey ||
    (settings?.require2fa && !result.user.twoFactorEnabled)
  ) {
    const [passkey] = await db
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.userId, result.user.id))
      .limit(1);
    if (!passkey) return null;
  }
  const scopes = result.access.scopes.filter((scope) =>
    result.consent.scopes.includes(scope),
  );
  if (
    !scopes.some((scope) => scope === "harly:read" || scope === "harly:write")
  )
    return null;
  const role = normalizeWorkspaceRole(result.membership.role);
  return {
    context: {
      session: result.session,
      user: result.user,
      organization: result.organization,
      membership: { id: result.membership.id, role },
      role,
      roleKey: result.membership.role,
    },
    scopes,
    clientId: result.access.clientId,
    consentId: result.consent.id,
    tokenId: result.access.id,
  };
}
