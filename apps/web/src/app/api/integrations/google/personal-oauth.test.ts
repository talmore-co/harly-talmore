import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), context: vi.fn(), permission: vi.fn(), state: vi.fn(), verify: vi.fn(),
  getToken: vi.fn(), encrypt: vi.fn(), calendars: vi.fn(), values: vi.fn(), rows: vi.fn(), saved: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContextOrNull: mocks.context }));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/gcal/config", () => ({ createOAuth2Client: () => ({
  generateAuthUrl: () => "https://accounts.google.com/o/oauth2/auth",
  getToken: mocks.getToken, setCredentials: vi.fn(),
}) }));
vi.mock("@/lib/gcal/client", () => ({ listCalendars: mocks.calendars }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: mocks.encrypt, isEncryptionConfigured: () => true }));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "http://localhost:3100" }));
vi.mock("@/server/oauth-state", () => ({
  createInstallState: mocks.state,
  verifySignedState: (state: string) => state === "personal-state" ? { p: "google-personal" } : null,
  verifyAndConsumeOauthStateNonce: mocks.verify,
}));
vi.mock("@harly/db", () => {
  const connection = { workspaceId: "workspace", userId: "user", accountEmail: "email" };
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.rows }) }) }),
    insert: () => ({ values: (values: unknown) => {
      mocks.values(values);
      return { onConflictDoUpdate: () => ({ returning: mocks.saved }) };
    } }),
  };
  return { db: { ...tx, transaction: async (fn: (tx: unknown) => unknown) => fn(tx) }, personalGoogleConnections: connection, workspaceSettings: {} };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
import { GET as install } from "./install/route";
import { GET as callback } from "./callback/route";

describe("personal Google OAuth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "recruiter-a" }, session: { activeOrganizationId: "workspace-a" } });
    mocks.context.mockResolvedValue({ user: { id: "recruiter-a" }, organization: { id: "workspace-a" } });
    mocks.state.mockResolvedValue("personal-state");
    mocks.verify.mockResolvedValue({ ok: true, workspaceId: "workspace-a" });
    mocks.getToken.mockResolvedValue({ tokens: { access_token: "synthetic-access", refresh_token: "synthetic-refresh" } });
    mocks.encrypt.mockReturnValue({ ciphertext: "encrypted", iv: "iv", tag: "tag" });
    mocks.calendars.mockResolvedValue([{ id: "alice-calendar", primary: true }]);
    mocks.rows.mockResolvedValue([]);
    mocks.saved.mockResolvedValue([{ id: "connection-a" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ email: "alice@example.com" })));
  });
  afterEach(() => vi.unstubAllGlobals());
  const request = () => new NextRequest("http://localhost:3100/api/integrations/google/callback?code=synthetic-code&state=personal-state");

  it("lets a recruiter start their own flow without admin integration permission", async () => {
    const response = await install(new NextRequest("http://localhost:3100/api/integrations/google/install?ws=workspace-a&scope=personal"));
    expect(response.status).toBe(307);
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.state).toHaveBeenCalledWith({ userId: "recruiter-a", workspaceId: "workspace-a", provider: "google-personal" });
  });

  it("refuses starting a connection for another workspace", async () => {
    const response = await install(new NextRequest("http://localhost:3100/api/integrations/google/install?ws=workspace-b&scope=personal"));
    expect(response.status).toBe(403);
    expect(mocks.state).not.toHaveBeenCalled();
  });

  it("still requires administrator permission for the legacy workspace flow", async () => {
    mocks.permission.mockRejectedValue(new Error("Forbidden"));
    const response = await install(new NextRequest("http://localhost:3100/api/integrations/google/install?ws=workspace-a"));
    expect(response.status).toBe(403);
    expect(mocks.state).not.toHaveBeenCalled();
  });

  it("binds callback credentials to the authenticated member and workspace", async () => {
    const response = await callback(request());
    expect(response.headers.get("location")).toBe("http://localhost:3100/account?tab=connections&gcal=connected");
    expect(mocks.verify).toHaveBeenCalledWith({ state: "personal-state", userId: "recruiter-a", workspaceId: "workspace-a", provider: "google-personal" });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-a", userId: "recruiter-a", accountEmail: "alice@example.com", refreshTokenCiphertext: "encrypted", calendarId: "alice-calendar" }));
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it("does not exchange tokens when nonce validation fails", async () => {
    mocks.verify.mockResolvedValue({ ok: false, error: "State actor mismatch." });
    await callback(request());
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("rechecks membership before storing credentials", async () => {
    mocks.context.mockResolvedValue(null);
    await callback(request());
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("does not swap the identity behind existing calendar events", async () => {
    mocks.saved.mockResolvedValue([]);
    const response = await callback(request());
    expect(response.headers.get("location")).toContain("gcal_error=");
    expect(mocks.values).toHaveBeenCalled();
  });

  it("returns a safe message for provider failures", async () => {
    mocks.getToken.mockRejectedValue(new Error("private provider response"));
    const response = await callback(request());
    expect(response.headers.get("location")).toContain("gcal_error=");
    expect(response.headers.get("location")).not.toContain("private");
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
