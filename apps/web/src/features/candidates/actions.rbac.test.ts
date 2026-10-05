import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  requireCandidatePermission: vi.fn(),
  requireTrashedCandidatePermission: vi.fn(),
  requirePermission: vi.fn(),
  requireJobPermission: vi.fn(),
  getWorkspaceContext: vi.fn(),
  deleteCandidate: vi.fn(),
  restoreCandidate: vi.fn(),
  enqueueCandidateDeletionJob: vi.fn(),
  startCandidateDeletionJob: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {},
  activityEvents: {},
  applications: {},
  candidates: {},
  candidateFiles: {},
  candidateNotes: {},
  candidateTags: {},
  jobStages: {},
  jobs: {},
  member: {},
  notifications: {},
  scorecards: {},
  mailMessages: {},
  mailThreads: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireCandidatePermission: mocks.requireCandidatePermission,
  requireTrashedCandidatePermission: mocks.requireTrashedCandidatePermission,
  requirePermission: mocks.requirePermission,
  requireJobPermission: mocks.requireJobPermission,
}));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: vi.fn() }));
vi.mock("@/lib/ai/surfaces/parse-resume", () => ({
  parseResumeStructured: vi.fn(),
}));
vi.mock("@/features/mailbox/compose-shared", () => ({
  composerAttachmentsSchema: z.array(z.unknown()).optional(),
  decodeComposerAttachments: vi.fn(),
  richBodyReact: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: vi.fn() }));
vi.mock("@/lib/email/inbound-token", () => ({ getInboundReplyTo: vi.fn() }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: vi.fn() }));
vi.mock("@/lib/mail/send-canonical-email", () => ({ sendCanonicalEmail: vi.fn() }));
vi.mock("@/lib/mail/feature-flag", () => ({ isMailUnificationEnabled: vi.fn() }));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("./service", () => ({ serializeCandidate: vi.fn() }));
vi.mock("./referrals/service", () => ({
  createReferralRecord: vi.fn(),
  serializeReferral: vi.fn(),
}));
vi.mock("@/features/pipeline/actions", () => ({ updateApplicationStatus: vi.fn() }));
vi.mock("./data", () => ({
  permanentlyDeleteCandidate: vi.fn(),
  deleteCandidate: mocks.deleteCandidate,
  restoreCandidate: mocks.restoreCandidate,
  listCandidateDirectory: vi.fn(),
}));
vi.mock("@/lib/csv", () => ({ toSafeCsv: vi.fn() }));
vi.mock("@/lib/storage-validation", () => ({
  allowedResumeContentTypes: new Set(),
  maxResumeFileSize: 1,
  isWorkspaceStorageKey: vi.fn(),
}));
vi.mock("@/features/applications/resume-autofill", () => ({
  extractResumeAutofillFields: vi.fn(),
}));
vi.mock("@/lib/resume/extract-text", () => ({ extractResumeText: vi.fn() }));
vi.mock("@/lib/resume/storage-key", () => ({ resumeKeyFromUrl: vi.fn() }));
vi.mock("./create-candidate-errors", () => ({ isCandidateEmailConflict: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("./deletion-jobs", () => ({
  enqueueCandidateDeletionJob: mocks.enqueueCandidateDeletionJob,
  markCandidateDeletionBlocked: vi.fn(),
  markCandidateDeletionCompleted: vi.fn(),
  markCandidateDeletionFailed: vi.fn(),
  requeueCandidateDeletionJob: vi.fn(),
  startCandidateDeletionJob: mocks.startCandidateDeletionJob,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  bulkTrashCandidatesAction,
  generateEmailDraftAction,
  permanentlyDeleteCandidateAction,
  refineScorecardTextAction,
  restoreCandidateAction,
  suggestScorecardAttributesAction,
} from "./actions";

describe("candidate AI authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCandidatePermission.mockRejectedValue(
      new Error("You do not have access to this candidate."),
    );
  });

  it("authorizes the candidate before generating an email draft", async () => {
    await expect(
      generateEmailDraftAction({ candidateId: "candidate-1", type: "followup" }),
    ).rejects.toThrow("You do not have access to this candidate.");
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "collab:write",
      "candidate-1",
    );
  });

  it("authorizes the candidate before refining scorecard text", async () => {
    await expect(
      refineScorecardTextAction({ comment: "Private note", candidateId: "candidate-1" }),
    ).rejects.toThrow("You do not have access to this candidate.");
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "collab:write",
      "candidate-1",
    );
  });

  it("authorizes the candidate before suggesting scorecard attributes", async () => {
    await expect(
      suggestScorecardAttributesAction({ candidateId: "candidate-1" }),
    ).rejects.toThrow("You do not have access to this candidate.");
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "collab:write",
      "candidate-1",
    );
  });
});

describe("candidate trash actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The active-candidate lookup cannot see a trashed candidate.
    mocks.requireCandidatePermission.mockRejectedValue(
      new Error("Candidate not found."),
    );
    mocks.requireTrashedCandidatePermission.mockResolvedValue({});
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1", email: "recruiter@example.test" },
    });
  });

  it("restores a trashed candidate through the trashed-aware lookup", async () => {
    mocks.restoreCandidate.mockResolvedValue({ ok: true });

    await expect(restoreCandidateAction("candidate-1")).resolves.toEqual({
      success: true,
    });
    expect(mocks.requireTrashedCandidatePermission).toHaveBeenCalledWith(
      "candidates:delete",
      "candidate-1",
    );
    expect(mocks.requireCandidatePermission).not.toHaveBeenCalled();
  });

  it("does not restore when the trashed-aware lookup denies access", async () => {
    mocks.requireTrashedCandidatePermission.mockRejectedValue(
      new Error("You do not have access to this candidate."),
    );

    await expect(restoreCandidateAction("candidate-1")).rejects.toThrow(
      "You do not have access to this candidate.",
    );
    expect(mocks.restoreCandidate).not.toHaveBeenCalled();
  });

  it("authorizes delete forever through the trashed-aware lookup", async () => {
    mocks.enqueueCandidateDeletionJob.mockResolvedValue({
      id: "job-1",
      status: "completed",
    });

    await expect(
      permanentlyDeleteCandidateAction("candidate-1"),
    ).resolves.toEqual({ success: true });
    expect(mocks.requireTrashedCandidatePermission).toHaveBeenCalledWith(
      "candidates:delete",
      "candidate-1",
    );
    expect(mocks.requireCandidatePermission).not.toHaveBeenCalled();
  });
});

describe("bulk candidate deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({});
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1", email: "recruiter@example.test" },
    });
    mocks.enqueueCandidateDeletionJob.mockImplementation(
      async ({ candidateId }: { candidateId: string }) => ({
        id: `job-${candidateId}`,
        status: "pending",
      }),
    );
    mocks.startCandidateDeletionJob.mockResolvedValue({ id: "job" });
  });

  it("revalidates and names the failures when only some deletions succeed", async () => {
    mocks.deleteCandidate.mockImplementation(async (candidateId: string) =>
      candidateId === "candidate-2"
        ? { ok: false, error: "This candidate has documents under legal hold and cannot be erased yet." }
        : { ok: true, stats: {} },
    );

    const result = await bulkTrashCandidatesAction([
      "candidate-1",
      "candidate-2",
      "candidate-3",
    ]);

    expect(result).toEqual({
      success: false,
      error: "Some candidates could not be deleted.",
      count: 2,
      failed: [
        {
          candidateId: "candidate-2",
          error:
            "This candidate has documents under legal hold and cannot be erased yet.",
        },
      ],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/candidates");
  });

  it("reports full success without a failure list", async () => {
    mocks.deleteCandidate.mockResolvedValue({ ok: true, stats: {} });

    await expect(
      bulkTrashCandidatesAction(["candidate-1", "candidate-2"]),
    ).resolves.toEqual({ success: true, count: 2 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/candidates");
  });
});
