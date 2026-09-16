import { beforeEach, describe, expect, it, vi } from "vitest";

// The email_outbox worker is the single delivery path for transactional emails.
// It must be idempotent (never resend an offer already `sent`) and must retry
// transient failures with a growing backoff before giving up.

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];
  const transactionReturningQueue: unknown[][] = [];
  const updateCalls: Array<{ set: Record<string, unknown> }> = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    insertQueue,
    transactionReturningQueue,
    updateCalls,
    transactionImpl,
    sendWorkspaceEmail: vi.fn(),
    renderActiveEmailTemplate: vi.fn(),
    getWorkspaceEmailBranding: vi.fn(),
    insertCanonicalMessage: vi.fn(),
    getWorkspaceEmailConfig: vi.fn(),
  };
});

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.orderBy = () => q;
    q.limit = async () => mocks.selectQueue.shift() ?? [];
    return q;
  };
  return {
    db: {
      execute: vi.fn(async () => [{ id: "outbox-1" }]),
      select: vi.fn(makeQuery),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => mocks.insertQueue.shift() ?? [{ id: "x" }] }),
      })),
      update: vi.fn(() => ({
        set: (set: Record<string, unknown>) => {
          mocks.updateCalls.push({ set });
          return { where: () => ({}) };
        },
      })),
      transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transactionImpl(fn),
    },
    offers: {},
    emailOutbox: {},
    candidates: {},
    organization: {},
    activityEvents: {},
    documentAssociations: {},
    documents: {},
    applications: {},
  };
});

vi.mock("@/lib/email", () => ({ sendWorkspaceEmail: mocks.sendWorkspaceEmail }));
vi.mock("@/lib/email/branding", () => ({ getWorkspaceEmailBranding: mocks.getWorkspaceEmailBranding }));
vi.mock("@/lib/email/config", () => ({ getWorkspaceEmailConfig: mocks.getWorkspaceEmailConfig }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: mocks.insertCanonicalMessage }));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: mocks.renderActiveEmailTemplate,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));

import { processEmailOutbox } from "./outbox-processor";

const PENDING = {
  id: "outbox-1",
  workspaceId: "ws-1",
  kind: "offer.extended",
  payload: { offerId: "offer-1", actorId: "user-1" },
  status: "pending",
  attempts: 0,
  nextRetryAt: null,
};

const OFFER_DRAFT = {
  id: "offer-1",
  status: "draft",
  title: "Engineer",
  applicationId: "app-1",
  candidateId: "cand-1",
  jobId: "job-1",
};
const OFFER_SENT = { ...OFFER_DRAFT, status: "sent" };
const APPLICATION_ACTIVE = {
  id: "app-1",
  status: "active",
  candidateId: "cand-1",
  jobId: "job-1",
};
const RECIPIENT = { email: "c@example.com", firstName: "C", lastName: "D", companyName: "Acme" };

function reset() {
  mocks.selectQueue.length = 0;
  mocks.insertQueue.length = 0;
  mocks.transactionReturningQueue.length = 0;
  mocks.updateCalls.length = 0;
  mocks.transactionImpl.mockReset();
  mocks.sendWorkspaceEmail.mockReset();
  mocks.renderActiveEmailTemplate.mockResolvedValue(null);
  mocks.getWorkspaceEmailBranding.mockResolvedValue({});
  mocks.insertCanonicalMessage.mockReset();
  mocks.insertCanonicalMessage.mockResolvedValue({ messageId: "mm-1", threadId: "mt-1", duplicate: false });
  mocks.getWorkspaceEmailConfig.mockReset();
  mocks.getWorkspaceEmailConfig.mockResolvedValue(null);
  mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let updateCount = 0;
    const tx = {
      update: () => ({
        set: (set: Record<string, unknown>) => {
          mocks.updateCalls.push({ set });
          return {
            where: () => ({
              returning: async () => {
                updateCount += 1;
                return mocks.transactionReturningQueue.shift() ?? (updateCount === 1 ? [{ id: "offer-1" }] : []);
              },
            }),
          };
        },
      }),
    };
    return fn(tx);
  });
}

describe("email_outbox worker", () => {
  beforeEach(reset);

  it.each(["pipeline.stage", "pipeline.rejected"])("suppresses legacy automatic %s emails without retrying", async kind => {
    mocks.selectQueue.push([{ ...PENDING, kind, payload: { candidateEmail: "c@example.com", type: kind === "pipeline.stage" ? "stage" : "rejected" } }]);
    const result = await processEmailOutbox();
    expect(result.sent).toBe(0);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
    expect(mocks.updateCalls).toContainEqual({ set: expect.objectContaining({ status: "failed", nextRetryAt: null, lockedBy: null, lastError: expect.stringContaining("not explicitly requested") }) });
  });

  it("delivers explicitly requested rejection emails using the active template", async () => {
    mocks.selectQueue.push([{ ...PENDING, kind: "pipeline.rejected", payload: { candidateEmail: "c@example.com", candidateName: "Test Candidate", type: "rejected", explicitlyRequested: true } }], [{ id: "cand-1" }]);
    mocks.renderActiveEmailTemplate.mockResolvedValue({ subject: "Application update", bodyHtml: "<p>Thank you for applying.</p>" });
    mocks.sendWorkspaceEmail.mockResolvedValue(true);
    const result = await processEmailOutbox();
    expect(result.sent).toBe(1);
    expect(mocks.renderActiveEmailTemplate).toHaveBeenCalledWith("ws-1", "rejection", expect.any(Object));
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
  });

  it("omits a rejection portal link when the portal is disabled", async () => {
    mocks.selectQueue.push([{ ...PENDING, kind: "pipeline.rejected", payload: { candidateEmail: "c@example.com", applicationId: "app-1", type: "rejected", explicitlyRequested: true } }], [{ id: "cand-1" }]);
    mocks.getWorkspaceEmailBranding.mockResolvedValue({ name: "Talmore", portalEnabled: false });
    mocks.sendWorkspaceEmail.mockResolvedValue(true);
    await processEmailOutbox();
    expect(mocks.sendWorkspaceEmail.mock.calls[0][1].react.props.portalUrl).toBeUndefined();
  });

  it("attaches a calendar file and formats the invitation in the selected timezone", async () => {
    mocks.selectQueue.push([{ ...PENDING, kind: "interview.scheduled", createdAt: new Date("2026-09-16T00:00:00Z"), payload: { interviewId: "interview-1", candidateEmail: "c@example.com", companyName: "Talmore", jobTitle: "Test role", scheduledAt: "2026-09-17T07:00:00Z", timeZone: "Asia/Manila", durationMins: 30 } }], [{ id: "cand-1" }]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);
    const result = await processEmailOutbox();
    expect(result.sent).toBe(1);
    const options = mocks.sendWorkspaceEmail.mock.calls[0][1];
    expect(options.react.props.when).toMatch(/3:00.*pm.*GMT\+08:00.*Asia\/Manila/i);
    expect(options.attachments[0].filename).toBe("interview.ics");
    expect(options.attachments[0].content.toString()).toContain("DTSTART:20260917T070000Z");
    expect(mocks.renderActiveEmailTemplate).toHaveBeenCalledWith("ws-1", "interview_invite", expect.objectContaining({ interview_date: "Thursday, 17 September 2026", interview_time: expect.not.stringContaining("September") }));
  });

  it("sends the email and flips the offer + outbox to sent on success", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    const sentUpdates = mocks.updateCalls.filter((c) => c.set.status === "sent");
    expect(sentUpdates.length).toBeGreaterThan(0);
  });

  it("does not resend when the offer is already sent (idempotent)", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_SENT]);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("queues a retry (keeps pending + bumps attempts) when delivery fails", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(false);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    // No success path; the failing row must carry a retry error + attempt bump.
    const failedUpdate = mocks.updateCalls.find((c) => c.set.lastError !== undefined);
    expect(failedUpdate?.set.lastError).toMatch(/did not accept/i);
    expect(failedUpdate?.set).toHaveProperty("attempts");
  });

  it("records the sent offer in the canonical conversation model", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.insertCanonicalMessage).toHaveBeenCalledTimes(1);
    const call = mocks.insertCanonicalMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      workspaceId: "ws-1",
      candidateId: "cand-1",
      applicationId: "app-1",
      direction: "outbound",
      source: "provider",
    });
  });

  it("does not send an offer after its application becomes terminal", async () => {
    mocks.selectQueue.push([
      PENDING,
    ], [OFFER_DRAFT], [{ ...APPLICATION_ACTIVE, status: "rejected" }]);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("does not revive a withdrawn offer when delivery races its final transition", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.transactionReturningQueue.push([], []);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    expect(mocks.insertCanonicalMessage).not.toHaveBeenCalled();
  });
});
