import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getWorkspaceContext: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: mocks.isNull,
  isNotNull: mocks.isNotNull,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  applications: {},
  candidates: {},
  customRoles: {},
  jobs: {},
  jobHiringTeam: {},
  offers: {},
  interviews: {},
  member: {},
  user: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));

import {
  requireCandidatePermission,
  requireTrashedCandidatePermission,
} from "./permissions-server";

const WORKSPACE_ID = "workspace-1";

function makeSelectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("candidate permission scope without applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows owner access to a candidate with no applications", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "owner-1" },
      roleKey: "owner",
    });
    mocks.select.mockReturnValue(makeSelectReturning([{ id: "candidate-1" }]));

    await expect(
      requireCandidatePermission("candidates:view", "candidate-1"),
    ).resolves.toMatchObject({ organization: { id: WORKSPACE_ID } });
  });

  it("allows an admin/global candidates:view role to see a candidate with no applications", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "admin-1" },
      roleKey: "admin",
    });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([{ permissions: ["candidates:view"] }]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([{ id: "candidate-1" }]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            permissions: ["candidates:view"],
            scope: { jobAccess: "all" },
          },
        ]),
      );

    await expect(
      requireCandidatePermission("candidates:view", "candidate-1"),
    ).resolves.toMatchObject({ organization: { id: WORKSPACE_ID } });
  });

  it("does not turn an assigned-only candidates:view role into global candidate access", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
      roleKey: "scoped-recruiter",
    });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([{ permissions: ["candidates:view"] }]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([{ id: "candidate-1" }]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            permissions: ["candidates:view"],
            scope: { jobAccess: "assigned" },
          },
        ]),
      ).mockReturnValueOnce(makeSelectReturning([]));

    await expect(
      requireCandidatePermission("candidates:view", "candidate-1"),
    ).rejects.toThrow(/not assigned to a job|access/i);
  });
});

describe("candidate permission for trashed candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up active candidates only by default", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "owner-1" },
      roleKey: "owner",
    });
    mocks.select.mockReturnValue(makeSelectReturning([{ id: "candidate-1" }]));

    await requireCandidatePermission("candidates:delete", "candidate-1");

    expect(mocks.isNull).toHaveBeenCalled();
    expect(mocks.isNotNull).not.toHaveBeenCalled();
  });

  it("finds a candidate that is in the trash", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "owner-1" },
      roleKey: "owner",
    });
    mocks.select.mockReturnValue(makeSelectReturning([{ id: "candidate-1" }]));

    await expect(
      requireTrashedCandidatePermission("candidates:delete", "candidate-1"),
    ).resolves.toMatchObject({ organization: { id: WORKSPACE_ID } });
    expect(mocks.isNotNull).toHaveBeenCalled();
    expect(mocks.isNull).not.toHaveBeenCalled();
  });

  it("reports a missing candidate when nothing matches in the trash", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "owner-1" },
      roleKey: "owner",
    });
    mocks.select.mockReturnValue(makeSelectReturning([]));

    await expect(
      requireTrashedCandidatePermission("candidates:delete", "candidate-1"),
    ).rejects.toThrow("Candidate not found.");
  });

  it("keeps assigned-only scope for trashed candidates", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
      roleKey: "scoped-recruiter",
    });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([{ permissions: ["candidates:delete"] }]),
      )
      .mockReturnValueOnce(makeSelectReturning([{ id: "candidate-1" }]))
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            permissions: ["candidates:delete"],
            scope: { jobAccess: "assigned" },
          },
        ]),
      )
      .mockReturnValueOnce(makeSelectReturning([]));

    await expect(
      requireTrashedCandidatePermission("candidates:delete", "candidate-1"),
    ).rejects.toThrow(/not assigned to a job/i);
  });
});

describe("candidate permission for department/region scoped roles", () => {
  const regionPolicy = {
    permissions: ["candidates:edit"],
    scope: { jobAccess: "all", regions: ["EMEA"] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
      roleKey: "emea-recruiter",
    });
  });

  /** Selects up to and including the candidate's application list. */
  function queueCandidateLookup(applicationRows: unknown[]) {
    mocks.select
      .mockReturnValueOnce(makeSelectReturning([regionPolicy])) // permissions
      .mockReturnValueOnce(makeSelectReturning([{ id: "candidate-1" }]))
      .mockReturnValueOnce(makeSelectReturning([regionPolicy])) // policy
      .mockReturnValueOnce(makeSelectReturning(applicationRows));
  }

  /** Selects made by the nested requireJobPermission for one application. */
  function queueJobCheck(job: { department: string | null; region: string | null }) {
    mocks.select
      .mockReturnValueOnce(makeSelectReturning([regionPolicy])) // permissions
      .mockReturnValueOnce(makeSelectReturning([regionPolicy])) // policy
      .mockReturnValueOnce(makeSelectReturning([{ id: "job-1", ...job }]));
  }

  it("does not treat jobAccess=all as unrestricted when a region limit is set", async () => {
    queueCandidateLookup([]);

    await expect(
      requireCandidatePermission("candidates:edit", "candidate-1"),
    ).rejects.toThrow("Candidate is not assigned to a job.");
  });

  it("rejects a candidate whose only application is outside the role's region", async () => {
    queueCandidateLookup([{ jobId: "job-1" }]);
    queueJobCheck({ department: "Sales", region: "APAC" });

    await expect(
      requireCandidatePermission("candidates:edit", "candidate-1"),
    ).rejects.toThrow("You do not have access to this candidate.");
  });

  it("allows a candidate with an application inside the role's region", async () => {
    queueCandidateLookup([{ jobId: "job-1" }]);
    queueJobCheck({ department: "Sales", region: "emea" });

    await expect(
      requireCandidatePermission("candidates:edit", "candidate-1"),
    ).resolves.toMatchObject({ organization: { id: WORKSPACE_ID } });
  });
});
