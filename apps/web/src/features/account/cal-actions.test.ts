import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  permission: vi.fn(),
  connection: vi.fn(),
  profile: vi.fn(),
  sync: vi.fn(),
  conflict: vi.fn(),
  rows: [] as unknown[][],
}));
function query() {
  const q = {
    from: () => q,
    innerJoin: () => q,
    where: () => q,
    limit: () => q,
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(mocks.rows.shift() ?? []).then(resolve),
  };
  return q;
}
vi.mock("@harly/db", async (original) => ({
  ...(await original<typeof import("@harly/db")>()),
  db: {
    select: query,
    insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.conflict }) }),
  },
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireApplicationPermission: mocks.permission,
}));
vi.mock("@/lib/cal/personal", () => ({
  getPersonalCalConnection: mocks.connection,
  personalCalApiKey: () => "fictional-key",
  personalCalWebhookUrl: () => "https://ats.example.test/hook",
}));
vi.mock("@/lib/cal/personal-client", async (original) => ({
  ...await original<typeof import("@/lib/cal/personal-client")>(),
  getCalProfile: mocks.profile,
}));
import { CalApiError } from "@/lib/cal/personal-client";
vi.mock("@/lib/cal/personal-bookings", () => ({
  syncPersonalCalBooking: mocks.sync,
}));
vi.mock("@/lib/crypto", () => ({
  isEncryptionConfigured: () => true,
  encryptSecret: () => ({ ciphertext: "encrypted", iv: "iv", tag: "tag" }),
}));
import {
  connectMyCalAccount,
  createCandidateCalLink,
  getMyCalConnection,
  matchMyCalBooking,
} from "./cal-actions";
const applicationId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.length = 0;
  const context = {
    organization: { id: "workspace-a" },
    user: { id: "recruiter-a" },
  };
  mocks.context.mockResolvedValue(context);
  mocks.permission.mockResolvedValue(context);
  mocks.connection.mockResolvedValue(null);
});
describe("personal Cal.com action authorization", () => {
  it("distinguishes a rejected key from an outbound network failure", async () => {
    mocks.profile.mockRejectedValueOnce(new CalApiError(401));
    expect(await connectMyCalAccount({ apiKey: "fictional-key" })).toMatchObject({ ok: false, error: expect.stringContaining("rejected this API key") });
    mocks.profile.mockRejectedValueOnce(new TypeError("Invalid IP address: undefined"));
    const result = await connectMyCalAccount({ apiKey: "fictional-key" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("outbound connection") });
    expect(JSON.stringify(result)).not.toContain("fictional-key");
  });
  it("reports a storage failure after successful authentication without exposing database details", async () => {
    mocks.profile.mockResolvedValue({ id: 77, username: "fictional", email: "fictional@example.test" });
    mocks.conflict.mockReturnValue({ returning: async () => { throw new Error("private SQL details"); } });
    const result = await connectMyCalAccount({ apiKey: "fictional-key" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("accepted your key") });
    expect(JSON.stringify(result)).not.toContain("private SQL details");
  });
  it("uses the current member for account settings without admin permissions", async () => {
    await getMyCalConnection();
    expect(mocks.connection).toHaveBeenCalledWith("workspace-a", "recruiter-a");
  });
  it("does not return encrypted keys or signing secrets in account status", async () => {
    mocks.connection.mockResolvedValue({
      id: "connection",
      enabled: true,
      apiKeyCiphertext: "private",
      apiKeyIv: "private",
      apiKeyTag: "private",
      accountEmail: "fictional@example.test",
      username: "fictional",
      defaultEventTypeId: 12,
    });
    const result = await getMyCalConnection();
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.connection).toMatchObject({
      enabled: true,
      accountEmail: "fictional@example.test",
    });
  });
  it("rejects changing the provider identity behind an existing connection", async () => {
    mocks.profile.mockResolvedValue({
      id: 99,
      username: "other",
      email: "other@example.test",
    });
    mocks.conflict.mockReturnValue({ returning: async () => [] });
    expect(
      await connectMyCalAccount({ apiKey: "fictional-key" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("already linked"),
    });
    expect(mocks.conflict).toHaveBeenCalledWith(
      expect.objectContaining({ setWhere: expect.anything() }),
    );
  });
  it("checks application access before reading interviewer credentials or matching", async () => {
    mocks.permission.mockRejectedValue(new Error("Forbidden"));
    await expect(
      createCandidateCalLink({ applicationId, interviewerId: "recruiter-b" }),
    ).rejects.toThrow("Forbidden");
    expect(
      (await matchMyCalBooking({ applicationId, bookingId: applicationId })).ok,
    ).toBe(false);
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("creates the link from the assigned interviewer rather than the actor", async () => {
    mocks.connection.mockResolvedValue({
      id: "connection-b",
      enabled: true,
      defaultEventTypeId: 12,
    });
    mocks.rows.push(
      [
        {
          id: applicationId,
          bookingUrl: "https://cal.com/fictional/screen",
          webhookId: "hook",
          webhookSecret: "fictional-signing-secret",
        },
      ],
      [
        {
          name: "Fictional",
          lastName: "Candidate",
          email: "fictional@example.test",
        },
      ],
    );
    const result = await createCandidateCalLink({
      applicationId,
      interviewerId: "recruiter-b",
    });
    expect(mocks.connection).toHaveBeenCalledWith("workspace-a", "recruiter-b");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new URL(result.url).pathname).toBe("/fictional/screen");
      expect(result.url).not.toContain("fictional-signing-secret");
    }
  });
});
