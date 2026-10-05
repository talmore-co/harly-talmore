import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireJobPermission: vi.fn(),
  requirePermission: vi.fn(),
  getRolePermissions: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  updateJobStatus: vi.fn(),
  jobFormParse: vi.fn(),
  jobStatusParse: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {},
  workspaceSettings: {},
}));
vi.mock("./data", () => ({
  createJob: mocks.createJob,
  permanentlyDeleteJob: vi.fn(),
  restoreJob: vi.fn(),
  trashJob: vi.fn(),
  updateJob: mocks.updateJob,
  updateJobStatus: mocks.updateJobStatus,
}));
vi.mock("./validation", () => ({
  jobFormSchema: { parse: mocks.jobFormParse },
  jobStatusSchema: { parse: mocks.jobStatusParse },
}));
vi.mock("./approval", () => ({ getPendingJobApproval: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission: mocks.requireJobPermission,
  requirePermission: mocks.requirePermission,
  getRolePermissions: mocks.getRolePermissions,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: vi.fn() }));
vi.mock("@/lib/ai/surfaces/generate-job", () => ({
  generateJobDraftWithAI: vi.fn(),
}));
vi.mock("@/features/career-page/config", () => ({
  normalizeCareerPageConfig: vi.fn(() => ({
    hero: {},
    intro: {},
    values: { enabled: false, items: [] },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

import {
  createJobAction,
  updateJobAction,
  updateJobStatusAction,
} from "./actions";

const JOB_ID = "job-1";

describe("job action authorization", () => {
  it("checks job scope before parsing or updating a job", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const form = new FormData();
    form.set("jobId", JOB_ID);

    await expect(updateJobAction(form)).rejects.toThrow(
      "You are not assigned to this job.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
    expect(mocks.jobFormParse).not.toHaveBeenCalled();
    expect(mocks.updateJob).not.toHaveBeenCalled();
  });

  it("checks job scope before changing publication status", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const form = new FormData();
    form.set("jobId", JOB_ID);
    form.set("status", "open");

    await expect(updateJobStatusAction(form)).rejects.toThrow(
      "You are not assigned to this job.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
    expect(mocks.updateJobStatus).not.toHaveBeenCalled();
  });
});

describe("job publishing authorization", () => {
  const context = {
    organization: { id: "workspace-1", slug: "acme" },
    user: { id: "user-1", email: "user@example.com" },
    roleKey: "hiring_manager",
  };

  function statusForm(status: string) {
    const form = new FormData();
    form.set("jobId", JOB_ID);
    form.set("status", status);
    mocks.jobStatusParse.mockReturnValue(status);
    return form;
  }

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requirePermission.mockResolvedValue(context);
    mocks.requireJobPermission.mockResolvedValue(context);
    mocks.createJob.mockResolvedValue({ id: JOB_ID });
    mocks.updateJobStatus.mockResolvedValue({
      id: JOB_ID,
      slug: "engineer",
      title: "Engineer",
    });
    mocks.jobFormParse.mockReturnValue({ title: "Engineer", slug: "engineer" });
  });

  it("requires jobs:publish on the job before opening it", async () => {
    mocks.requireJobPermission.mockImplementation(async (permission: string) => {
      if (permission === "jobs:publish") {
        throw new Error("You do not have permission to perform this action.");
      }
      return context;
    });

    await expect(updateJobStatusAction(statusForm("open"))).rejects.toThrow(
      "You do not have permission to perform this action.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith(
      "jobs:publish",
      JOB_ID,
      context,
    );
    expect(mocks.updateJobStatus).not.toHaveBeenCalled();
  });

  it.each(["draft", "closed"])(
    "does not require jobs:publish to move a job to %s",
    async (status) => {
      await updateJobStatusAction(statusForm(status));

      expect(mocks.requireJobPermission).toHaveBeenCalledTimes(1);
      expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
      expect(mocks.updateJobStatus).toHaveBeenCalledWith(JOB_ID, status);
    },
  );

  it("opens the job for a member who holds jobs:publish", async () => {
    await updateJobStatusAction(statusForm("open"));

    expect(mocks.updateJobStatus).toHaveBeenCalledWith(JOB_ID, "open");
  });

  it("keeps a new job as a draft when the creator lacks jobs:publish", async () => {
    mocks.getRolePermissions.mockResolvedValue(["jobs:create", "jobs:edit"]);
    const form = new FormData();
    form.set("intent", "continue");

    await createJobAction(form);

    expect(mocks.requirePermission).toHaveBeenCalledWith("jobs:create");
    expect(mocks.createJob).toHaveBeenCalledTimes(1);
    expect(mocks.updateJobStatus).not.toHaveBeenCalled();
  });

  it("publishes a new job when the creator holds jobs:publish", async () => {
    mocks.getRolePermissions.mockResolvedValue(["jobs:create", "jobs:publish"]);
    const form = new FormData();
    form.set("intent", "continue");

    await createJobAction(form);

    expect(mocks.getRolePermissions).toHaveBeenCalledWith(
      context.organization.id,
      context.roleKey,
    );
    expect(mocks.updateJobStatus).toHaveBeenCalledWith(JOB_ID, "open");
  });

  it("never publishes when the creator chose to save a draft", async () => {
    mocks.getRolePermissions.mockResolvedValue(["jobs:create", "jobs:publish"]);
    const form = new FormData();
    form.set("intent", "draft");

    await createJobAction(form);

    expect(mocks.updateJobStatus).not.toHaveBeenCalled();
  });
});
