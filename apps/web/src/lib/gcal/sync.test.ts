import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  getWorkspaceGCalConfig: vi.fn(),
  invalidateWorkspaceGCalConnection: vi.fn(),
  update: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  and: vi.fn((...conditions: unknown[]) => conditions),
  selectRow: vi.fn(),
  getPersonalGCalConfig: vi.fn(),
  getInterviewerGCalConfig: vi.fn(),
  invalidatePersonalGCalConnection: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { update: mocks.update, select: () => ({ from: () => ({ where: () => ({ limit: mocks.selectRow }) }) }) },
  interviews: { id: "interviews.id", workspaceId: "interviews.workspaceId" },
}));
vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock("@/lib/gcal/personal", () => ({
  getPersonalGCalConfig: mocks.getPersonalGCalConfig,
  getInterviewerGCalConfig: mocks.getInterviewerGCalConfig,
  invalidatePersonalGCalConnection: mocks.invalidatePersonalGCalConnection,
}));
vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: mocks.getWorkspaceGCalConfig,
  invalidateWorkspaceGCalConnection: mocks.invalidateWorkspaceGCalConnection,
}));
vi.mock("@/lib/gcal/client", () => ({
  createEvent: mocks.createEvent,
  deleteEvent: mocks.deleteEvent,
  getEvent: mocks.getEvent,
  updateEvent: mocks.updateEvent,
}));

import {
  cancelInterviewGCalEvent,
  gcalEventIdForInterview,
  syncInterviewToGCal,
  updateInterviewGCalEvent,
} from "./sync";

describe("Google Calendar interview sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", gcalEventId: "event-1" }]);
  });
  it("derives a stable provider event id", () => {
    expect(gcalEventIdForInterview("6A5346F8-D3E6-4B2E-9D12-DA950CC40274")).toBe(
      "harl2d022172618d75e1daea03890ea0221627be0b703dfd8e87bdd126c75abaf3bf",
    );
  });

  it("recovers a committed event after a create conflict", async () => {
    mocks.getWorkspaceGCalConfig.mockResolvedValue({
      oauth2Client: {},
      calendarId: "primary",
    });
    mocks.createEvent.mockRejectedValue(
      new Error("Google Calendar API 409: already exists"),
    );
    mocks.getEvent.mockResolvedValue({
      id: "harl50321e912e2c75386aa2a462826d3e839f78f522dcf10e8f8a61f23a41200bf3",
      hangoutLink: "https://meet.google.com/recovered",
    });
    mocks.update.mockReturnValue({
      set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    await expect(
      syncInterviewToGCal({
        workspaceId: "workspace-1",
        interviewId: "interview-1",
        summary: "Introduction",
        start: new Date("2026-07-21T13:00:00.000Z"),
        durationMins: 60,
        mode: "video",
      }),
    ).resolves.toEqual({
      ok: true,
      eventId: "harl50321e912e2c75386aa2a462826d3e839f78f522dcf10e8f8a61f23a41200bf3",
      meetLink: "https://meet.google.com/recovered",
    });
    expect(mocks.createEvent).toHaveBeenCalledWith(
      {},
      "primary",
      expect.objectContaining({ id: "harl50321e912e2c75386aa2a462826d3e839f78f522dcf10e8f8a61f23a41200bf3" }),
    );
    expect(mocks.getEvent).toHaveBeenCalledWith(
      {},
      "primary",
      "harl50321e912e2c75386aa2a462826d3e839f78f522dcf10e8f8a61f23a41200bf3",
    );
    expect(mocks.and).toHaveBeenCalled();
    expect(mocks.and.mock.calls[0]).toHaveLength(2);
  });

  it("returns failure when updating Google Calendar fails", async () => {
    mocks.getWorkspaceGCalConfig.mockResolvedValue({
      oauth2Client: {},
      calendarId: "primary",
    });
    mocks.updateEvent.mockRejectedValue(new Error("calendar unavailable"));

    await expect(
      updateInterviewGCalEvent({
        workspaceId: "workspace-1",
        gcalEventId: "event-1",
        start: new Date("2026-07-21T13:00:00.000Z"),
      }),
    ).resolves.toBe(false);
  });

  it("scopes the interview row cleanup to the workspace", async () => {
    mocks.getWorkspaceGCalConfig.mockResolvedValue({
      oauth2Client: {},
      calendarId: "primary",
    });
    mocks.deleteEvent.mockResolvedValue(undefined);
    mocks.update.mockReturnValue({
      set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    await expect(
      cancelInterviewGCalEvent({
        workspaceId: "workspace-1",
        interviewId: "interview-1",
        gcalEventId: "event-1",
      }),
    ).resolves.toBe(true);
    expect(mocks.and.mock.calls.at(-1)).toHaveLength(2);
  });

  it("pins the assigned interviewer's account before creating an event", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", interviewerId: "alice", gcalEventId: null }]);
    const config = { oauth2Client: { owner: "alice" }, calendarId: "alice-calendar", connectionId: "alice-connection" };
    mocks.getInterviewerGCalConfig.mockResolvedValue(config);
    const set = vi.fn(() => ({ where: () => ({ returning: async () => [{ id: "interview-1" }] }) }));
    mocks.update.mockReturnValue({ set });
    mocks.createEvent.mockImplementation(async () => {
      expect(set).toHaveBeenCalledWith({ gcalConnectionId: "alice-connection", gcalCalendarId: "alice-calendar" });
      return { id: "event-1" };
    });
    expect(await syncInterviewToGCal({ workspaceId: "workspace-1", interviewId: "interview-1", summary: "Interview", start: new Date(), durationMins: 30 })).toMatchObject({ ok: true });
    expect(mocks.getInterviewerGCalConfig).toHaveBeenCalledWith("workspace-1", "alice");
    expect(mocks.createEvent).toHaveBeenCalledWith(config.oauth2Client, "alice-calendar", expect.anything());
    expect(mocks.getWorkspaceGCalConfig).not.toHaveBeenCalled();
  });

  it("does not borrow the shared connection for an unconnected interviewer", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", interviewerId: "bob", gcalEventId: null }]);
    mocks.getInterviewerGCalConfig.mockResolvedValue(null);
    expect(await syncInterviewToGCal({ workspaceId: "workspace-1", interviewId: "interview-1", summary: "Interview", start: new Date(), durationMins: 30 })).toEqual({ ok: false, reason: "not_connected" });
    expect(mocks.getWorkspaceGCalConfig).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("uses the new interviewer when an edit creates the first calendar event", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", interviewerId: "alice", gcalEventId: null }]);
    mocks.getInterviewerGCalConfig.mockResolvedValue(null);
    await syncInterviewToGCal({ workspaceId: "workspace-1", interviewId: "interview-1", interviewerId: "bob", summary: "Interview", start: new Date(), durationMins: 30 });
    expect(mocks.getInterviewerGCalConfig).toHaveBeenCalledWith("workspace-1", "bob");
  });

  it("updates the original host and calendar after reassignment or calendar preference changes", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", interviewerId: "bob", gcalEventId: "event-1", gcalConnectionId: "alice-connection", gcalCalendarId: "original-calendar" }]);
    mocks.getPersonalGCalConfig.mockResolvedValue({ oauth2Client: { owner: "alice" }, calendarId: "new-default", connectionId: "alice-connection" });
    mocks.updateEvent.mockResolvedValue({});
    expect(await updateInterviewGCalEvent({ workspaceId: "workspace-1", gcalEventId: "event-1", attendees: ["bob@example.com"] })).toBe(true);
    expect(mocks.getPersonalGCalConfig).toHaveBeenCalledWith("workspace-1", { connectionId: "alice-connection" });
    expect(mocks.updateEvent).toHaveBeenCalledWith({ owner: "alice" }, "original-calendar", "event-1", expect.objectContaining({ attendees: ["bob@example.com"] }));
    expect(mocks.getInterviewerGCalConfig).not.toHaveBeenCalled();
  });

  it("keeps timed-out creates on the pinned calendar when retried", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", interviewerId: "bob", gcalEventId: null, gcalConnectionId: "alice-connection", gcalCalendarId: "original-calendar" }]);
    mocks.getPersonalGCalConfig.mockResolvedValue({ oauth2Client: {}, calendarId: "new-default", connectionId: "alice-connection" });
    mocks.createEvent.mockRejectedValue(new Error("timeout"));
    expect(await syncInterviewToGCal({ workspaceId: "workspace-1", interviewId: "interview-1", summary: "Interview", start: new Date(), durationMins: 30 })).toEqual({ ok: false, reason: "failed" });
    expect(mocks.createEvent).toHaveBeenCalledWith({}, "original-calendar", expect.anything());
    expect(mocks.getInterviewerGCalConfig).not.toHaveBeenCalled();
  });

  it("does not fall back to another account when the event owner disconnects", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", gcalEventId: "event-1", gcalConnectionId: "alice-connection", gcalCalendarId: "original-calendar" }]);
    mocks.getPersonalGCalConfig.mockResolvedValue(null);
    expect(await cancelInterviewGCalEvent({ workspaceId: "workspace-1", interviewId: "interview-1", gcalEventId: "event-1" })).toBe(false);
    expect(mocks.deleteEvent).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceGCalConfig).not.toHaveBeenCalled();
  });

  it("invalidates only the personal connection when its token is revoked", async () => {
    mocks.selectRow.mockResolvedValue([{ id: "interview-1", gcalEventId: "event-1", gcalConnectionId: "alice-connection", gcalCalendarId: "original-calendar" }]);
    mocks.getPersonalGCalConfig.mockResolvedValue({ oauth2Client: {}, calendarId: "original-calendar", connectionId: "alice-connection" });
    mocks.updateEvent.mockRejectedValue(new Error("invalid_grant"));
    expect(await updateInterviewGCalEvent({ workspaceId: "workspace-1", gcalEventId: "event-1" })).toBe(false);
    expect(mocks.invalidatePersonalGCalConnection).toHaveBeenCalledWith("workspace-1", "alice-connection");
    expect(mocks.invalidateWorkspaceGCalConnection).not.toHaveBeenCalled();
  });
});
