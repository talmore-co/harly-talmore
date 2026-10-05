import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  verifyPortalOAuthState: vi.fn(),
  isPortalEnabled: vi.fn(),
  exchangeGoogleCode: vi.fn(),
  findOrCreateCandidateByEmail: vi.fn(),
  createPortalSession: vi.fn(),
}));

// next/navigation is deliberately not mocked: redirect() signals by throwing,
// and the route has to let that signal through its own error handling.
vi.mock("next/headers", () => ({
  cookies: async () => mocks.cookieStore,
}));
vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "portal-session",
  createPortalSession: mocks.createPortalSession,
  exchangeGoogleCode: mocks.exchangeGoogleCode,
  findOrCreateCandidateByEmail: mocks.findOrCreateCandidateByEmail,
  isPortalEnabled: mocks.isPortalEnabled,
}));
vi.mock("@/lib/portal-oauth-state", () => ({
  PORTAL_OAUTH_STATE_COOKIE: "portal-oauth-state",
  verifyPortalOAuthState: mocks.verifyPortalOAuthState,
}));
vi.mock("@/lib/public-origin", () => ({
  getHarlyPublicOrigin: () => "https://ats.example.test",
}));

import { GET } from "./route";

/** Where the route redirected to, read from the error redirect() throws. */
async function redirectTarget() {
  const request = {
    url: "https://ats.example.test/api/portal/auth/callback/google?code=fictional-code&state=fictional-state",
    headers: new Headers(),
  };
  try {
    await GET(request as never);
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw error;
  }
  throw new Error("The route did not redirect.");
}

describe("GET /api/portal/auth/callback/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.cookieStore.get.mockReturnValue({ value: "fictional-cookie" });
    mocks.verifyPortalOAuthState.mockReturnValue({
      workspaceId: "ws-1",
      next: "/portal/dashboard",
    });
    mocks.isPortalEnabled.mockResolvedValue(true);
    mocks.exchangeGoogleCode.mockResolvedValue({
      email: "candidate@example.test",
      firstName: "Ada",
      lastName: "Example",
    });
    mocks.findOrCreateCandidateByEmail.mockResolvedValue("candidate-1");
    mocks.createPortalSession.mockResolvedValue("fictional-session");
  });

  it("lands on the requested page after a successful sign-in", async () => {
    expect(await redirectTarget()).toBe("/portal/dashboard");
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "portal-session",
      "fictional-session",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("reports a disabled portal as such, without exchanging the code", async () => {
    mocks.isPortalEnabled.mockResolvedValue(false);

    expect(await redirectTarget()).toBe("/portal/login?error=no_workspace");
    expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it("still reports a provider failure as oauth_failed", async () => {
    mocks.exchangeGoogleCode.mockRejectedValue(new Error("Fictional failure"));

    expect(await redirectTarget()).toBe("/portal/login?error=oauth_failed");
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });
});
