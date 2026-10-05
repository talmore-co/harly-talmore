import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireJobPermission: vi.fn(),
  duplicateJob: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("./duplicate-service", () => ({ duplicateJob: mocks.duplicateJob }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission: mocks.requireJobPermission,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { duplicateJobAction } from "./duplicate-actions";

const context = {
  organization: { id: "ws-1" },
  user: { id: "user-1", email: "recruiter@example.test" },
};

describe("duplicateJobAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires job creation rights on the source job before copying", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You do not have permission to perform this action."),
    );

    await expect(duplicateJobAction("job-1")).rejects.toThrow(
      "You do not have permission to perform this action.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith(
      "jobs:create",
      "job-1",
    );
    expect(mocks.duplicateJob).not.toHaveBeenCalled();
  });

  it("returns the copy's id and records where it came from", async () => {
    mocks.requireJobPermission.mockResolvedValue(context);
    mocks.duplicateJob.mockResolvedValue({
      id: "job-2",
      title: "Senior Engineer (copy)",
      slug: "senior-engineer-copy",
    });

    await expect(duplicateJobAction("job-1")).resolves.toEqual({
      success: true,
      jobId: "job-2",
    });
    expect(mocks.duplicateJob).toHaveBeenCalledWith("job-1");
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "job.created",
        resourceId: "job-2",
        metadata: expect.objectContaining({ duplicatedFromJobId: "job-1" }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/jobs");
  });

  it("reports a missing source job without logging a creation", async () => {
    mocks.requireJobPermission.mockResolvedValue(context);
    mocks.duplicateJob.mockResolvedValue(null);

    await expect(duplicateJobAction("job-1")).resolves.toEqual({
      success: false,
      error: "Job not found.",
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
