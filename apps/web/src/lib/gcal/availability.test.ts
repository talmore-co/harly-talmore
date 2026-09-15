import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(), busy: vi.fn(), permission: vi.fn(), where: vi.fn(),
}));
vi.mock("@harly/db", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
  interviews: { workspaceId: "workspace", interviewerId: "interviewer", status: "status" },
}));
vi.mock("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: (a: unknown, b: unknown) => [a, b], gt: vi.fn(), lt: vi.fn(), ne: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: async () => ({ organization: { id: "workspace-1" } }) }));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.permission, requireInterviewPermission: mocks.permission }));
vi.mock("./personal", () => ({ getInterviewerGCalConfig: mocks.config }));
vi.mock("./client", () => ({ getFreeBusy: mocks.busy }));
import { checkAvailability } from "./availability";

const window = { timeMin: new Date("2026-10-01T10:00:00Z"), timeMax: new Date("2026-10-01T11:00:00Z") };

describe("personal interviewer availability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.where.mockResolvedValue([]);
    mocks.busy.mockResolvedValue([]);
    mocks.config.mockImplementation(async (_workspace, interviewer) => ({ oauth2Client: { interviewer }, availabilityCalendarIds: [`${interviewer}-calendar`] }));
  });

  it("checks separate calendars for simultaneous interviews with different recruiters", async () => {
    mocks.busy.mockImplementation(async (_client, calendar) => calendar === "alice-calendar" ? [{ start: window.timeMin.toISOString(), end: window.timeMax.toISOString() }] : []);
    const alice = await checkAvailability({ ...window, interviewerId: "alice" });
    const bob = await checkAvailability({ ...window, interviewerId: "bob" });
    expect(alice.gcalBusy).toHaveLength(1);
    expect(bob.gcalBusy).toEqual([]);
    expect(bob.error).toBeUndefined();
    expect(mocks.where).toHaveBeenCalledWith(expect.arrayContaining([["interviewer", "bob"], ["workspace", "workspace-1"]]));
  });

  it("includes all calendars selected by the interviewer", async () => {
    mocks.config.mockResolvedValue({ oauth2Client: {}, availabilityCalendarIds: ["work", "personal"] });
    await checkAvailability({ ...window, interviewerId: "alice" });
    expect(mocks.busy.mock.calls.map((call) => call[1])).toEqual(["work", "personal"]);
  });

  it("shows unavailable status instead of declaring a disconnected interviewer free", async () => {
    mocks.config.mockResolvedValue(null);
    const result = await checkAvailability({ ...window, interviewerId: "alice" });
    expect(result.error).toContain("not connected");
    expect(mocks.busy).not.toHaveBeenCalled();
  });

  it("reports provider failures instead of treating errors as free time", async () => {
    mocks.busy.mockRejectedValue(new Error("unavailable"));
    expect((await checkAvailability({ ...window, interviewerId: "alice" })).error).toContain("Could not check");
  });

  it("does not retrieve another recruiter's calendar without scheduling permission", async () => {
    mocks.permission.mockRejectedValue(new Error("Forbidden"));
    expect((await checkAvailability({ ...window, interviewerId: "alice" })).error).toBeDefined();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("bounds the calendar query window", async () => {
    expect((await checkAvailability({ ...window, timeMax: new Date("2027-01-01"), interviewerId: "alice" })).error).toContain("seven days");
    expect(mocks.config).not.toHaveBeenCalled();
  });
});
