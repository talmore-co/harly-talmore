import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), config: vi.fn(), calendars: vi.fn(), invalidate: vi.fn(),
  where: vi.fn(), set: vi.fn(), row: vi.fn(),
}));
vi.mock("@harly/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (conditions: unknown) => { mocks.where(conditions); return { limit: mocks.row }; } }) }),
    update: () => ({ set: mocks.set }),
  },
  personalGoogleConnections: { workspaceId: "workspace", userId: "user", id: "connection" },
}));
vi.mock("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: (a: unknown, b: unknown) => [a, b] }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.context }));
vi.mock("@/lib/gcal/config", () => ({ createOAuth2Client: () => ({}) }));
vi.mock("@/lib/crypto", () => ({ isEncryptionConfigured: () => true }));
vi.mock("@/lib/gcal/client", () => ({ listCalendars: mocks.calendars }));
vi.mock("@/lib/gcal/personal", () => ({ getPersonalGCalConfig: mocks.config, invalidatePersonalGCalConnection: mocks.invalidate }));
import { disconnectMyGoogleConnection, getMyGoogleConnection, listMyGoogleCalendars, saveMyGoogleCalendars } from "./google-actions";

describe("personal calendar settings authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ organization: { id: "workspace-a" }, user: { id: "recruiter-a" } });
    mocks.config.mockResolvedValue({ oauth2Client: {}, connectionId: "connection-a" });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.row.mockResolvedValue([]);
    mocks.calendars.mockResolvedValue([
      { id: "work", summary: "Work", accessRole: "owner" },
      { id: "shared", summary: "Shared", accessRole: "reader" },
    ]);
  });

  it("allows an ordinary member to view only their own connection", async () => {
    await getMyGoogleConnection();
    expect(mocks.where).toHaveBeenCalledWith([["workspace", "workspace-a"], ["user", "recruiter-a"]]);
  });

  it("lists calendars using the current member's credentials", async () => {
    expect((await listMyGoogleCalendars()).ok).toBe(true);
    expect(mocks.config).toHaveBeenCalledWith("workspace-a", { userId: "recruiter-a" });
  });

  it("permits read-only availability calendars but requires a writable event calendar", async () => {
    expect(await saveMyGoogleCalendars({ calendarId: "work", availabilityCalendarIds: ["shared"] })).toEqual({ ok: true });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "work", availabilityCalendarIds: ["work", "shared"] }));
    expect(mocks.where).toHaveBeenCalledWith([["workspace", "workspace-a"], ["user", "recruiter-a"], ["connection", "connection-a"]]);
  });

  it("rejects a calendar the member cannot access", async () => {
    expect((await saveMyGoogleCalendars({ calendarId: "other-person", availabilityCalendarIds: ["work"] })).ok).toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("rejects using a read-only calendar to create interviews", async () => {
    expect((await saveMyGoogleCalendars({ calendarId: "shared", availabilityCalendarIds: ["work"] })).ok).toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("disconnects only the current workspace member", async () => {
    await disconnectMyGoogleConnection();
    expect(mocks.where).toHaveBeenCalledWith([["workspace", "workspace-a"], ["user", "recruiter-a"]]);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, refreshTokenCiphertext: null }));
  });

  it("invalidates only this person's revoked connection and returns a safe error", async () => {
    mocks.calendars.mockRejectedValue(new Error("invalid_grant private provider details"));
    const result = await listMyGoogleCalendars();
    expect(result).toEqual({ ok: false, error: "Could not access Google Calendar. Reconnect your account and try again." });
    expect(mocks.invalidate).toHaveBeenCalledWith("workspace-a", "connection-a");
  });

  it("does not access credentials without a workspace membership", async () => {
    mocks.context.mockRejectedValue(new Error("Unauthorized"));
    await expect(disconnectMyGoogleConnection()).rejects.toThrow("Unauthorized");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
