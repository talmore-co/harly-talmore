import { createHash } from "node:crypto";
import { APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { oauthProvider } from "@better-auth/oauth-provider";
export { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, member, verification } from "@harly/db";

export const MCP_SCOPES = ["harly:read", "harly:write", "offline_access"];
export const MCP_TOKEN_PREFIX = "harly_mcp_";
export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Serialize OAuth issuance and revocation across application replicas. Provider
// writes use their own connection; this transaction holds only the advisory lock.
export async function withMcpOAuthLock<T>(run: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('harly-mcp-oauth'))`,
    );
    return run();
  });
}

export async function removePendingMcpCodes(
  userId: string,
  clientId: string,
  workspaceId: string,
) {
  const pending = await db
    .select({ id: verification.id, value: verification.value })
    .from(verification)
    .where(gt(verification.expiresAt, new Date()));
  const ids = pending.flatMap((row) => {
    try {
      const value = JSON.parse(row.value);
      return value?.type === "authorization_code" &&
        value?.userId === userId &&
        value?.query?.client_id === clientId &&
        value?.referenceId === workspaceId
        ? [row.id]
        : [];
    } catch {
      return [];
    }
  });
  if (ids.length)
    await db.delete(verification).where(inArray(verification.id, ids));
}

// This provider serves exactly one resource. Enforce it at authorization as
// well as token exchange; 1.6.x otherwise ignores authorization resources.
export function mcpOAuthResourceGuard(origin: string) {
  return createAuthMiddleware(async (context) => {
    if (
      context.path !== "/oauth2/authorize" &&
      context.path !== "/oauth2/token"
    )
      return;
    const resource =
      context.path === "/oauth2/authorize"
        ? context.query?.resource
        : context.body?.resource;
    if (resource !== undefined && resource !== `${origin}/api/mcp`) {
      throw new APIError("BAD_REQUEST", {
        error: "invalid_target",
        error_description: "Only the Talmore MCP resource is supported.",
      });
    }
  });
}

export function mcpOAuthProvider(origin: string) {
  return oauthProvider({
    loginPage: "/mcp/login",
    consentPage: "/mcp/consent",
    scopes: MCP_SCOPES,
    validAudiences: [`${origin}/api/mcp`],
    // Opaque, resource-specific tokens support immediate revocation and live RBAC.
    disableJwtPlugin: true,
    grantTypes: ["authorization_code", "refresh_token"],
    accessTokenExpiresIn: 15 * 60,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
    codeExpiresIn: 5 * 60,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultScopes: MCP_SCOPES,
    clientRegistrationAllowedScopes: MCP_SCOPES,
    storeTokens: { hash: hashMcpToken },
    prefix: {
      opaqueAccessToken: MCP_TOKEN_PREFIX,
      refreshToken: "harly_mcp_refresh_",
    },
    postLogin: {
      page: "/mcp/consent",
      shouldRedirect: async () => false,
      consentReferenceId: async ({ user, session }) => {
        const workspaceId = session.activeOrganizationId;
        const memberships = await db
          .select({ id: member.id, workspaceId: member.organizationId })
          .from(member)
          .where(
            and(
              typeof workspaceId === "string"
                ? eq(member.organizationId, workspaceId)
                : undefined,
              eq(member.userId, user.id),
              eq(member.status, "active"),
            ),
          )
          .limit(2);
        if (memberships.length !== 1)
          throw new APIError("FORBIDDEN", {
            message: "Select an active Talmore workspace before connecting.",
          });
        return memberships[0]!.workspaceId;
      },
    },
  });
}
