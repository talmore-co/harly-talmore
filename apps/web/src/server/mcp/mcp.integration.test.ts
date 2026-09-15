import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  organization,
  user,
  session,
  member,
  jobs,
  jobStages,
  oauthClient,
  candidates,
  applications,
  oauthConsent,
} from "@harly/db";
let auth: typeof import("@/lib/auth").auth;
let POST: typeof import("@/app/api/mcp/route").POST;
let authenticateMcp: typeof import("./auth").authenticateMcp;
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn().mockResolvedValue(null),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));

const integration =
  process.env.RUN_MCP_INTEGRATION === "1" ? describe : describe.skip;
integration("MCP OAuth and recruiting tools", () => {
  const workspaceId = `mcp-${randomUUID()}`;
  const otherWorkspaceId = `mcp-${randomUUID()}`;
  const otherCandidateId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const sessionToken = randomUUID();
  const jobId = randomUUID();
  let cookie: string;
  let clientId: string;
  let accessToken: string;
  let refreshToken: string;
  let seeded = false;
  let candidateId: string;
  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";
  async function request(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  }
  async function tool(name: string, args: unknown) {
    const response = await POST(
      new Request(`${origin}/api/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    return {
      error: data.result?.isError,
      value: JSON.parse(data.result.content[0].text),
    };
  }
  beforeAll(async () => {
    ({ auth } = await import("@/lib/auth"));
    ({ POST } = await import("@/app/api/mcp/route"));
    ({ authenticateMcp } = await import("./auth"));
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("eval")
    )
      throw new Error("Use isolated local evaluation database.");
    seeded = true;
    await db.insert(organization).values({
      id: otherWorkspaceId,
      name: "Fictional other MCP workspace",
      slug: otherWorkspaceId,
      createdAt: new Date(),
    });
    await db.insert(candidates).values({
      id: otherCandidateId,
      workspaceId: otherWorkspaceId,
      firstName: "Private",
      lastName: "Candidate",
      email: "private@example.test",
    });
    await db.insert(organization).values({
      id: workspaceId,
      name: "Fictional MCP workspace",
      slug: workspaceId,
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: userId,
      name: "Fictional MCP recruiter",
      email: `${userId}@example.test`,
    });
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: workspaceId,
      userId,
      role: "owner",
      status: "active",
      createdAt: new Date(),
    });
    await db.insert(session).values({
      id: sessionId,
      token: sessionToken,
      userId,
      activeOrganizationId: null,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await db.insert(jobs).values({
      id: jobId,
      workspaceId,
      createdById: userId,
      title: "Fictional MCP role",
      slug: jobId,
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Test only",
      status: "open",
    });
    await db.insert(jobStages).values({
      id: randomUUID(),
      jobId,
      workspaceId,
      name: "Applied",
      order: 0,
    });
    const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
      .update(sessionToken)
      .digest("base64");
    cookie = `better-auth.session_token=${encodeURIComponent(`${sessionToken}.${signature}`)}`;
  });
  afterAll(async () => {
    if (!seeded) return;
    if (clientId)
      await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(organization).where(eq(organization.id, otherWorkspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("registers a public PKCE client and authorizes scoped access through consent", async () => {
    const registration = await request("/oauth2/register", {
      client_name: "Fictional MCP client",
      redirect_uris: ["http://localhost:9876/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "harly:read harly:write offline_access",
    });
    const client = await registration.json();
    clientId = client.client_id;
    expect([200, 201]).toContain(registration.status);
    const verifier =
      "fictional-test-verifier-with-at-least-forty-three-characters";
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://localhost:9876/callback",
      response_type: "code",
      scope: "harly:read harly:write offline_access",
      state: "fictional-state",
      resource: `${origin}/api/mcp`,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await request(`/oauth2/authorize?${query}`, undefined, {
      cookie,
    });
    expect(authorize.status).toBe(302);
    const consentUrl = new URL(authorize.headers.get("location")!, origin);
    expect(consentUrl.pathname).toBe("/mcp/consent");
    const consent = await request(
      "/oauth2/consent",
      { accept: true, oauth_query: consentUrl.search.slice(1) },
      { cookie },
    );
    expect(consent.status).toBe(200);
    const consentResult = await consent.json();
    const callback = new URL(consentResult.url);
    expect(callback.searchParams.get("state")).toBe("fictional-state");
    const tokenResponse = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: callback.searchParams.get("code")!,
          code_verifier: verifier,
          redirect_uri: "http://localhost:9876/callback",
          resource: `${origin}/api/mcp`,
        }),
      }),
    );
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json();
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    const actor = await authenticateMcp(
      new Request(`${origin}/api/mcp`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    expect(actor?.context.user.id).toBe(userId);
    expect(actor?.context.organization.id).toBe(workspaceId);
    mocks.context.mockResolvedValue(actor!.context);
  });
  it("renews access using the refresh token", async () => {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshToken,
          resource: `${origin}/api/mcp`,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const tokens = await response.json();
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    expect(
      await authenticateMcp(
        new Request(`${origin}/api/mcp`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    ).not.toBeNull();
  });
  it("rejects unknown resources and missing PKCE challenges", async () => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://localhost:9876/callback",
      response_type: "code",
      scope: "harly:read",
      state: "test",
      resource: "https://example.test/wrong-resource",
    });
    const response = await request(`/oauth2/authorize?${params}`, undefined, {
      cookie,
    });
    const location = response.headers.get("location");
    expect(
      location
        ? new URL(location, origin).searchParams.has("error")
        : response.status >= 400,
    ).toBe(true);
    params.set("resource", `${origin}/api/mcp`);
    const missingPkce = await request(
      `/oauth2/authorize?${params}`,
      undefined,
      { cookie },
    );
    const pkceLocation = missingPkce.headers.get("location");
    expect(
      pkceLocation
        ? new URL(pkceLocation, origin).searchParams.has("error")
        : missingPkce.status >= 400,
    ).toBe(true);
  });
  it("returns an OAuth discovery challenge without credentials", async () => {
    const response = await POST(
      new Request(`${origin}/api/mcp`, { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/api/mcp",
    );
  });
  it("creates a candidate and application through MCP without duplicates", async () => {
    const created = await tool("create_candidate", {
      firstName: "Fictional",
      lastName: "MCP Candidate",
      email: `${randomUUID()}@example.test`,
    });
    expect(created.error).toBeFalsy();
    candidateId = created.value.id;
    const assigned = await tool("add_candidate_to_pipeline", {
      candidateId,
      jobId,
    });
    expect(assigned.error).toBeFalsy();
    expect(assigned.value.source).toBe("Manual");
    const duplicate = await tool("add_candidate_to_pipeline", {
      candidateId,
      jobId,
    });
    expect(duplicate.error).toBe(true);
    expect(
      await db
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.candidateId, candidateId),
            eq(applications.jobId, jobId),
          ),
        ),
    ).toHaveLength(1);
  });
  it("does not expose another workspace's candidates", async () => {
    expect(
      (await tool("get_candidate", { candidateId: otherCandidateId })).error,
    ).toBe(true);
    expect(
      (await tool("search_candidates", { query: "private@example.test" })).value
        .candidates,
    ).toEqual([]);
    expect(
      (
        await tool("add_candidate_to_pipeline", {
          candidateId: otherCandidateId,
          jobId,
        })
      ).error,
    ).toBe(true);
  });
  it("honors narrowed consent scopes immediately", async () => {
    await db
      .update(oauthConsent)
      .set({ scopes: ["harly:read"] })
      .where(eq(oauthConsent.clientId, clientId));
    const actor = await authenticateMcp(
      new Request(`${origin}/api/mcp`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    expect(actor?.scopes).toEqual(["harly:read"]);
    const response = await POST(
      new Request(`${origin}/api/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    const data = await response.json();
    expect(
      data.result.tools.some(
        (tool: { name: string }) => tool.name === "create_candidate",
      ),
    ).toBe(false);
    await db
      .update(oauthConsent)
      .set({ scopes: ["harly:read", "harly:write", "offline_access"] })
      .where(eq(oauthConsent.clientId, clientId));
  });
  it("rejects disabled clients", async () => {
    await db
      .update(oauthClient)
      .set({ disabled: true })
      .where(eq(oauthClient.clientId, clientId));
    expect(
      await authenticateMcp(
        new Request(`${origin}/api/mcp`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    ).toBeNull();
    await db
      .update(oauthClient)
      .set({ disabled: false })
      .where(eq(oauthClient.clientId, clientId));
  });
  it("enforces live role changes and candidate deletion", async () => {
    await db
      .update(user)
      .set({ mustChangePassword: true })
      .where(eq(user.id, userId));
    expect(
      await authenticateMcp(
        new Request(`${origin}/api/mcp`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    ).toBeNull();
    await db
      .update(user)
      .set({ mustChangePassword: false })
      .where(eq(user.id, userId));
    await db
      .update(member)
      .set({ role: "viewer" })
      .where(eq(member.userId, userId));
    const denied = await tool("create_candidate", {
      firstName: "Denied",
      lastName: "Candidate",
      email: `${randomUUID()}@example.test`,
    });
    expect(denied.error).toBe(true);
    await db
      .update(member)
      .set({ role: "owner" })
      .where(eq(member.userId, userId));
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    expect((await tool("get_candidate", { candidateId })).error).toBe(true);
  });
  it("revokes access, pending codes and concurrent refresh", async () => {
    const verifier =
      "another-fictional-verifier-with-at-least-forty-three-characters";
    const pendingQuery = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://localhost:9876/callback",
      response_type: "code",
      scope: "harly:read harly:write offline_access",
      state: "pending-test",
      resource: `${origin}/api/mcp`,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const pending = await request(
      `/oauth2/authorize?${pendingQuery}`,
      undefined,
      { cookie },
    );
    expect(pending.status).toBe(302);
    const pendingCode = new URL(
      pending.headers.get("location")!,
      origin,
    ).searchParams.get("code");
    expect(Boolean(pendingCode)).toBe(true);
    const [consent] = await db
      .select({ id: oauthConsent.id })
      .from(oauthConsent)
      .where(eq(oauthConsent.clientId, clientId));
    const { revokeMyMcpConnection } =
      await import("@/features/account/mcp-actions");
    const [racingRefresh] = await Promise.all([
      auth.handler(
        new Request(`${origin}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: refreshToken,
            resource: `${origin}/api/mcp`,
          }),
        }),
      ),
      revokeMyMcpConnection(consent!.id),
    ]);
    if (racingRefresh.status === 200) {
      const issued = await racingRefresh.json();
      expect(
        await authenticateMcp(
          new Request(`${origin}/api/mcp`, {
            headers: { Authorization: `Bearer ${issued.access_token}` },
          }),
        ),
      ).toBeNull();
    }
    expect(
      await authenticateMcp(
        new Request(`${origin}/api/mcp`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    ).toBeNull();
    const refreshed = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshToken,
          resource: `${origin}/api/mcp`,
        }),
      }),
    );
    expect(refreshed.status).toBeGreaterThanOrEqual(400);
    const exchange = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: pendingCode!,
          code_verifier: verifier,
          redirect_uri: "http://localhost:9876/callback",
          resource: `${origin}/api/mcp`,
        }),
      }),
    );
    expect(exchange.status).toBeGreaterThanOrEqual(400);
  });
});
