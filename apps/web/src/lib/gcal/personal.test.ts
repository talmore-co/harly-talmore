import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ where: vi.fn(), join: vi.fn(), rows: vi.fn(), decrypt: vi.fn(), credentials: vi.fn() }));
vi.mock("@harly/db", () => ({
  db: { select: () => ({ from: () => ({ innerJoin: (_table: unknown, conditions: unknown) => {
    mocks.join(conditions);
    return { where: (conditions: unknown) => { mocks.where(conditions); return { limit: mocks.rows }; } };
  } }) }) },
  personalGoogleConnections: { workspaceId: "connection.workspace", userId: "connection.user", id: "connection.id", enabled: "connection.enabled" },
  member: { organizationId: "member.workspace", userId: "member.user", status: "member.status" },
}));
vi.mock("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: (a: unknown, b: unknown) => [a, b] }));
vi.mock("./config", () => ({ createOAuth2Client: () => ({ setCredentials: mocks.credentials }) }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decrypt }));
import { getPersonalGCalConfig, getInterviewerGCalConfig } from "./personal";

describe("personal Google credential isolation", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.rows.mockResolvedValue([]); });

  it("requires the requested workspace and an active matching member", async () => {
    await getPersonalGCalConfig("workspace-a", { connectionId: "connection-b" });
    expect(mocks.where).toHaveBeenCalledWith([["connection.workspace", "workspace-a"], ["connection.id", "connection-b"], ["connection.enabled", true]]);
    expect(mocks.join).toHaveBeenCalledWith([["member.workspace", "connection.workspace"], ["member.user", "connection.user"], ["member.status", "active"]]);
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("does not pick a default account when no interviewer is assigned", async () => {
    expect(await getInterviewerGCalConfig("workspace-a", null)).toBeNull();
    expect(mocks.where).not.toHaveBeenCalled();
  });

  it("decrypts the selected member's credential only on the server", async () => {
    mocks.rows.mockResolvedValue([{ connection: { id: "connection-a", calendarId: "calendar-a", availabilityCalendarIds: ["calendar-a"], refreshTokenCiphertext: "ciphertext", refreshTokenIv: "iv", refreshTokenTag: "tag" } }]);
    mocks.decrypt.mockReturnValue("synthetic-token");
    const result = await getPersonalGCalConfig("workspace-a", { userId: "alice" });
    expect(result?.connectionId).toBe("connection-a");
    expect(mocks.credentials).toHaveBeenCalledWith({ refresh_token: "synthetic-token" });
    expect(mocks.where).toHaveBeenCalledWith(expect.arrayContaining([["connection.user", "alice"]]));
  });
});
