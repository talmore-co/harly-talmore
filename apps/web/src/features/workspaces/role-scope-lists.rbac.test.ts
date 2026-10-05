import { beforeEach, describe, expect, it, vi } from "vitest";

// List queries must enforce role scope in SQL. These tests run the real query
// builders against a capturing driver (no database) and assert on the SQL each
// list path sends for scoped and unrestricted roles.

const mocks = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
  respond: (sql: string): unknown[][] => {
    void sql;
    return [];
  },
  requirePermission: vi.fn(),
  getRolePolicy: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("@harly/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harly/db")>();
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const db = drizzle(
    async (sql, params) => {
      mocks.queries.push({ sql, params });
      return { rows: mocks.respond(sql) };
    },
    { schema: actual.schema },
  );
  return { ...actual, db };
});
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  getRolePolicy: mocks.getRolePolicy,
}));
vi.mock("@/features/ai-chat/data", () => ({
  deleteConversationsForCandidate: vi.fn(),
}));
vi.mock("@/lib/gcal/sync", () => ({ cancelInterviewGCalEvent: vi.fn() }));
vi.mock("@/lib/outlook/teams-sync", () => ({
  cancelInterviewTeamsMeeting: vi.fn(),
}));
vi.mock("@/lib/zoom/sync", () => ({ cancelInterviewZoomMeeting: vi.fn() }));
vi.mock("@/lib/jitsi/sync", () => ({ cancelInterviewJitsiMeeting: vi.fn() }));
vi.mock("@/lib/cal/config", () => ({ getWorkspaceCalConfig: vi.fn() }));
vi.mock("@/lib/cal/client", () => ({ cancelCalBooking: vi.fn() }));
vi.mock("@/lib/cal/personal", () => ({
  cancelPersonalCalBookingForDeletion: vi.fn(),
}));
vi.mock("@/lib/esign/config", () => ({ getWorkspaceEsignConfig: vi.fn() }));
vi.mock("@/lib/esign/client", () => ({ archiveSubmissionIdempotent: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/features/candidates/communication-data", () => ({
  listCandidateCommunication: vi.fn(),
}));

import {
  listCandidateDirectory,
  listCandidateDirectoryFacets,
  listCandidates,
  listTrashedCandidates,
} from "@/features/candidates/data";
import { getPipelineData, getPipelineSummary } from "@/features/pipeline/data";
import {
  getPoolStats,
  listOpenJobs,
  listPoolCandidates,
} from "@/features/pool/data";
import type { RoleScope } from "@/features/workspaces/permissions";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

const UNRESTRICTED: RoleScope = { jobAccess: "all", departments: [], regions: [] };
const ASSIGNED: RoleScope = { jobAccess: "assigned", departments: [], regions: [] };
const DEPARTMENT: RoleScope = {
  jobAccess: "all",
  departments: ["Engineering"],
  regions: [],
};

function actAs(scope: RoleScope) {
  mocks.getRolePolicy.mockResolvedValue({
    permissions: ["candidates:view"],
    scope,
  });
}

const allSql = () => mocks.queries.map((query) => query.sql).join("\n");
const allParams = () => mocks.queries.flatMap((query) => query.params);

describe("role scope in candidate list queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries.length = 0;
    mocks.respond = () => [];
    mocks.requirePermission.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: USER_ID },
      roleKey: "custom-role",
    });
  });

  describe.each([
    ["candidate directory", () => listCandidateDirectory({})],
    ["candidate directory facets", () => listCandidateDirectoryFacets()],
    ["legacy candidate list", () => listCandidates()],
    ["candidate trash", () => listTrashedCandidates()],
    ["talent pool", () => listPoolCandidates()],
    ["talent pool stats", () => getPoolStats()],
    ["talent pool job targets", () => listOpenJobs()],
    ["pipeline", () => getPipelineData(undefined)],
    ["pipeline summary", () => getPipelineSummary(JOB_ID)],
  ])("%s", (_name, run) => {
    it("requires candidates:view", async () => {
      actAs(UNRESTRICTED);
      mocks.requirePermission.mockRejectedValue(new Error("no permission"));

      await expect(run()).rejects.toThrow("no permission");
      expect(mocks.requirePermission).toHaveBeenCalledWith("candidates:view");
      expect(mocks.queries).toHaveLength(0);
    });

    it("adds no scope predicate for an unrestricted role", async () => {
      actAs(UNRESTRICTED);

      await run();

      expect(mocks.queries.length).toBeGreaterThan(0);
      expect(allSql()).not.toContain("scope_");
    });

    it("limits an assigned-jobs role to its hiring-team jobs in SQL", async () => {
      actAs(ASSIGNED);

      await run();

      expect(mocks.queries[0]!.sql).toContain('"job_hiring_team" "scope_team"');
      expect(mocks.queries[0]!.params).toContain(USER_ID);
    });

    it("limits a department role to its departments in SQL", async () => {
      actAs(DEPARTMENT);

      await run();

      expect(mocks.queries[0]!.sql).toMatch(/lower\("[a-z_]+"\."department"\) in/);
      expect(mocks.queries[0]!.params).toContain("engineering");
      expect(allSql()).not.toContain("scope_team");
    });
  });

  it("hides candidates without an in-scope application from the directory", async () => {
    actAs(ASSIGNED);

    await listCandidateDirectory({});

    // Both the count and the page query only keep candidates that have a
    // scoped "latest application"; pool-only candidates have none.
    const directoryQueries = mocks.queries.filter((query) =>
      query.sql.includes('"latest_application"'),
    );
    expect(directoryQueries).toHaveLength(2);
    for (const query of directoryQueries) {
      expect(query.sql).toContain('"latest_application"."id" is not null');
      // The scope check never matches a trashed job.
      expect(query.sql).toContain('"scope_job"."deleted_at" is null');
    }
  });

  it("only shows pool entries whose candidate has an in-scope application", async () => {
    actAs(DEPARTMENT);

    await listPoolCandidates();

    const [poolQuery] = mocks.queries;
    expect(poolQuery!.sql).toContain('"applications" "scope_application"');
    expect(poolQuery!.sql).toContain(
      '"scope_application"."candidate_id" = "pool_entries"."candidate_id"',
    );
  });

  it("does not select an out-of-scope job on the pipeline board", async () => {
    actAs(ASSIGNED);

    const data = await getPipelineData(JOB_ID);

    // The requested job is resolved against the scoped job list, which is
    // empty here, so nothing beyond that lookup is queried.
    expect(data).toEqual({ kind: "empty", jobs: [] });
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0]!.sql).toContain("scope_team");
  });

  it("scopes the all-open-jobs pipeline view to in-scope jobs", async () => {
    actAs(DEPARTMENT);
    // First query is the job picker; give it one in-scope job.
    let call = 0;
    mocks.respond = () => (call++ === 0 ? [[JOB_ID, "Engineer", "open"]] : []);

    await getPipelineData("all");

    const followUps = mocks.queries.slice(1);
    const stageQuery = followUps.find((query) =>
      query.sql.includes('from "job_stages"'),
    );
    const applicationQuery = followUps.find((query) =>
      query.sql.includes('from "applications"'),
    );
    expect(stageQuery!.sql).toMatch(/lower\("jobs"\."department"\) in/);
    expect(applicationQuery!.sql).toMatch(/lower\("jobs"\."department"\) in/);
    expect(allParams()).toContain("engineering");
  });
});
