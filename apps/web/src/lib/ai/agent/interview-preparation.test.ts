import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: vi.fn(),
  statuses: vi.fn(),
  interviewerGoogle: vi.fn(),
  resolveApplication: vi.fn(),
}));

vi.mock("@/lib/gcal/availability", () => ({ checkAvailability: mocks.availability }));
vi.mock("@/lib/gcal/personal", () => ({ getInterviewerGCalConfig: mocks.interviewerGoogle }));
vi.mock("@/features/workspaces/integrations-registry", () => ({ getIntegrationStatuses: mocks.statuses }));
vi.mock("./application-resolution", () => ({ resolveCandidateApplication: mocks.resolveApplication }));

import { prepareInterviewScheduling } from "./interview-preparation";

function statuses(ownGoogleConnected: boolean) {
  return {
    gcal: {
      enabled: ownGoogleConnected, hasRefreshToken: ownGoogleConnected,
      hasCredentials: true, encryptionReady: true,
      accountEmail: "chatting-recruiter@example.com", calendarId: "chatting-recruiter-calendar",
    },
    zoom: { installationState: "not_installed", configured: false },
    outlook: { enabled: false, hasToken: false, encryptionReady: true },
    jitsi: { enabled: false, baseUrl: null },
  };
}

const input = {
  workspaceId: "workspace-a", candidateId: "candidate-a", applicationId: "application-a",
  scheduledAt: "2099-01-01T10:00:00Z", durationMins: 45,
  interviewerId: "alice", meetingProvider: "auto" as const,
};

describe("AI interview scheduling preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveApplication.mockResolvedValue({ status: "resolved", application: { applicationId: "application-a" } });
    mocks.availability.mockResolvedValue({ gcalBusy: [], internalConflicts: [] });
    mocks.statuses.mockResolvedValue(statuses(false));
    mocks.interviewerGoogle.mockResolvedValue({ connectionId: "alice-connection", calendarId: "alice-calendar", oauth2Client: {} });
  });

  it("offers Meet using the assigned interviewer's connection even when the chatting recruiter is disconnected", async () => {
    const result = await prepareInterviewScheduling(input);
    expect(result).toMatchObject({ status: "ready", provider: "google_meet", providerReady: true, warnings: [] });
    expect(mocks.interviewerGoogle).toHaveBeenCalledWith("workspace-a", "alice");
    expect(mocks.availability).toHaveBeenCalledWith(expect.objectContaining({ interviewerId: "alice" }));
    expect(JSON.stringify(result)).not.toContain("oauth2Client");
  });

  it("does not promise Meet through the chatting recruiter's account when the interviewer is disconnected", async () => {
    mocks.statuses.mockResolvedValue(statuses(true));
    mocks.interviewerGoogle.mockResolvedValue(null);
    const result = await prepareInterviewScheduling({ ...input, meetingProvider: "google_meet" });
    expect(result).toMatchObject({ status: "needs_attention", provider: "google_meet", providerReady: false });
  });

  it("does not auto-select the chatting recruiter's Google account for an unassigned interview", async () => {
    mocks.statuses.mockResolvedValue(statuses(true));
    mocks.interviewerGoogle.mockResolvedValue(null);
    expect(await prepareInterviewScheduling({ ...input, interviewerId: null })).toMatchObject({ provider: "none", providerReady: false });
    expect(mocks.interviewerGoogle).toHaveBeenCalledWith("workspace-a", null);
  });

  it("surfaces a busy calendar block as advisory while preserving a confirmable schedule", async () => {
    const busy = [{ start: "2099-01-01T09:00:00Z", end: "2099-01-01T12:00:00Z" }];
    mocks.availability.mockResolvedValue({ gcalBusy: busy, internalConflicts: [] });
    expect(await prepareInterviewScheduling(input)).toMatchObject({
      status: "needs_attention", provider: "google_meet", providerReady: true,
      scheduledAt: input.scheduledAt, durationMins: 45,
      availability: { gcalBusy: busy, internalConflicts: [] },
      warnings: [expect.stringContaining("you can still confirm")],
    });
  });

  it("keeps internal-overlap and unavailable-calendar warnings alongside the Google busy warning", async () => {
    mocks.availability.mockResolvedValue({
      gcalBusy: [{ start: input.scheduledAt, end: "2099-01-01T11:00:00Z" }],
      internalConflicts: [{ interviewId: "existing-interview" }],
      error: "One calendar could not be checked.",
    });
    expect(await prepareInterviewScheduling(input)).toMatchObject({
      status: "needs_attention",
      warnings: expect.arrayContaining([
        "The interviewer has an internal scheduling conflict.",
        expect.stringContaining("This is advisory"),
        "One calendar could not be checked.",
      ]),
    });
  });
});
