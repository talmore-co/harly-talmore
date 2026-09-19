import { describe, expect, it } from "vitest";
import {
  buildAgencyReport,
  reportFilters,
  savedQualification,
  sourceLabels,
  type ReportApplication,
  type ReportTransition,
} from "./agency-metrics";

const now = new Date("2026-09-19T12:00:00Z");
const filters = reportFilters(
  { range: "custom", from: "2026-09-01", to: "2026-09-19" },
  now,
);
const job = {
  id: "job",
  title: "Fictional role",
  status: "open",
  clientId: null,
  clientName: null,
};
const app = (
  id: string,
  overrides: Partial<ReportApplication> = {},
): ReportApplication => ({
  id,
  candidateId: id,
  name: id,
  jobId: job.id,
  appliedAt: "2026-09-01T10:00:00Z",
  status: "active",
  stageId: "applied",
  stage: "Applied",
  hiredOn: null,
  rejectionSource: null,
  source: "public_form",
  qualification: null,
  attribution: null,
  ...overrides,
});
const move = (id: string, stage: string, at: string): ReportTransition => ({
  id: `${id}-${at}`,
  applicationId: id,
  stageId: stage.toLowerCase(),
  stage,
  at: `${at}T10:00:00Z`,
});
const report = (
  applications: ReportApplication[],
  transitions: ReportTransition[] = [],
) =>
  buildAgencyReport({
    workspaceId: "ws",
    filters,
    jobs: [job],
    applications,
    transitions,
    offers: [],
    now,
  });

describe("agency report definitions", () => {
  it("measures first submission once per role and exposes waiting and inconsistent dates", () => {
    const jobs = [
      { ...job, takenOn: "2026-09-01" },
      { ...job, id: "waiting", takenOn: "2026-08-01", status: "draft" },
      { ...job, id: "unknown", takenOn: null },
      { ...job, id: "invalid", takenOn: "2026-09-10" },
      { ...job, id: "same-day", takenOn: "2026-09-03" },
      { ...job, id: "closed", takenOn: "2026-09-04", status: "closed" },
    ];
    const data = buildAgencyReport({
      workspaceId: "ws",
      filters,
      jobs,
      now,
      offers: [],
      applications: [
        app("a"),
        app("b"),
        app("bad", { jobId: "invalid" }),
        app("same", { jobId: "same-day" }),
      ],
      transitions: [
        move("a", "Submitted", "2026-09-05"),
        move("a", "Submitted", "2026-09-08"),
        move("b", "Submitted", "2026-09-03"),
        move("bad", "Submitted", "2026-09-02"),
        move("same", "Submitted", "2026-09-03"),
      ],
    });
    expect(data.firstSubmission).toEqual({
      rolesTakenOn: 4,
      measured: 2,
      medianDays: 1,
      awaiting: 0,
      inconsistentDates: 1,
    });
    expect(data.roleCohort.find((row) => row.id === "job")).toMatchObject({
      daysToFirst: 2,
      firstSubmittedOn: "2026-09-03T10:00:00Z",
    });
    expect(data.waitingRoles.map((row) => [row.id, row.waitingDays])).toEqual([
      ["waiting", 49],
    ]);
    expect(data.approvalDateUnknown).toBe(1);
  });
  it("keeps current aging while limiting drilldown records to the period", () => {
    const data = report([app("old", { appliedAt: "2026-08-01T10:00:00Z" })]);
    expect(data.records).toEqual([]);
    expect(data.summary.active).toBe(1);
    expect(data.oldest.map((row) => row.applicationId)).toEqual(["old"]);
  });
  it("separates period activity, cohort outcomes and current aging", () => {
    const data = report(
      [
        app("old", {
          appliedAt: "2026-08-01T10:00:00Z",
          status: "hired",
          stage: "Hired",
          stageId: "hired",
          hiredOn: "2026-09-10",
        }),
        app("new", { stageId: "submitted", stage: "Submitted" }),
        app("unknown", { stageId: "interview", stage: "Interview" }),
      ],
      [
        move("old", "Submitted", "2026-08-20"),
        move("old", "Hired", "2026-09-12"),
        move("new", "Submitted", "2026-09-02"),
        move("new", "Screening", "2026-09-03"),
        move("new", "Submitted", "2026-09-05"),
      ],
    );
    expect(data.summary.applications).toBe(2);
    expect(data.summary.submitted).toBe(1);
    expect(data.summary.placements).toBe(1);
    expect(data.summary.medianPlacementDays).toBe(40);
    expect(data.summary.medianSubmissionDays).toBe(21);
    expect(data.sources[0].placements).toBe(0);
    expect(data.sources[0].submitted).toBe(1);
    expect(data.stages.find((row) => row.stage === "Submitted")).toMatchObject({
      active: 1,
      medianAge: 14,
      overdue: 1,
      completed: 2,
    });
    expect(data.stages.find((row) => row.stage === "Interview")).toMatchObject({
      active: 1,
      medianAge: null,
      unknownAge: 1,
    });
    expect(data.trend.reduce((total, row) => total + row.placements, 0)).toBe(
      1,
    );
    expect(
      data.records.find((row) => row.applicationId === "old")?.placedOn,
    ).toBe("2026-09-10");
  });
  it("uses offer records and decision dates, while source conversion counts applications once", () => {
    const data = buildAgencyReport({
      workspaceId: "ws",
      filters,
      jobs: [job],
      applications: [app("a", { hiredOn: "2026-09-01", status: "hired" })],
      transitions: [],
      now,
      offers: [
        {
          applicationId: "a",
          kind: "client",
          status: "accepted",
          offeredAt: "2026-08-30",
          decidedAt: "2026-09-01T00:00:00Z",
        },
        {
          applicationId: "a",
          kind: "client",
          status: "declined",
          offeredAt: "2026-09-02",
          decidedAt: "2026-09-03T00:00:00Z",
        },
        {
          applicationId: "a",
          kind: "talmore",
          status: "accepted",
          offeredAt: "2026-09-02",
          decidedAt: null,
        },
        {
          applicationId: "a",
          kind: "client",
          status: "pending",
          offeredAt: "2026-09-03",
          decidedAt: null,
        },
      ],
    });
    expect(data.summary).toMatchObject({
      accepted: 1,
      declined: 1,
      offerAcceptance: 50,
      clientOffers: 2,
      medianPlacementDays: 0,
      placements: 1,
    });
    expect(data.sources[0]).toMatchObject({
      applications: 1,
      offers: 1,
      placements: 1,
    });
  });
  it("preserves unknown rejections, excludes future events, and keeps reopened hire history", () => {
    const data = report(
      [
        app("unknown", { status: "rejected" }),
        app("client", { status: "rejected", rejectionSource: "client" }),
        app("reopened"),
        app("future", { appliedAt: "2026-09-20T00:00:00Z" }),
      ],
      [
        move("reopened", "Hired", "2026-09-03"),
        move("reopened", "Applied", "2026-09-04"),
        move("unknown", "Submitted", "2026-09-20"),
      ],
    );
    expect(data.summary).toMatchObject({
      applications: 3,
      submitted: 0,
      placements: 1,
      active: 1,
    });
    expect(
      data.outcomes.find((row) => row.label === "Rejection source unknown")
        ?.count,
    ).toBe(1);
    expect(
      data.outcomes.find((row) => row.label === "Rejected by client")?.count,
    ).toBe(1);
    expect(
      data.outcomes.find((row) => row.label === "Still active")?.count,
    ).toBe(1);
  });
  it("does not count closed-job applications in current waiting lists", () => {
    const data = buildAgencyReport({
      workspaceId: "ws",
      filters,
      jobs: [{ ...job, status: "closed" }],
      applications: [app("a")],
      transitions: [],
      offers: [],
      now,
    });
    expect(data.summary.applications).toBe(1);
    expect(data.summary.active).toBe(0);
    expect(data.oldest).toEqual([]);
  });
});

describe("saved scoring and attribution", () => {
  it("keeps qualification unknown without a saved threshold and never re-scores", () => {
    expect(
      savedQualification({ version: 1, qualified: false, threshold: null }),
    ).toBeNull();
    expect(
      savedQualification({ version: 1, qualified: false, threshold: 70 }),
    ).toBe(false);
    expect(
      savedQualification({
        version: 1,
        qualified: true,
        threshold: 70,
        score: 69.99,
      }),
    ).toBe(true);
  });
  it("uses old saved latest-touch attribution without visitor TTL and rejects another workspace", () => {
    const first = {
      capturedAt: "2025-01-01T00:00:00Z",
      landingPath: "/jobs/example",
      utm_source: "fb",
      utm_campaign: "first",
    };
    const snapshot = {
      version: 1,
      workspaceId: "ws",
      first,
      last: { ...first, utm_source: "ig", utm_campaign: "latest" },
    };
    expect(sourceLabels(snapshot, "ws", "public_form")).toMatchObject({
      source: "ig",
      campaign: "latest",
    });
    expect(sourceLabels(snapshot, "other", "public_form").source).toBe(
      "Unknown / unattributed",
    );
  });
});

describe("report calendar ranges", () => {
  it("uses complete UTC calendar days and correct month boundaries", () => {
    expect(
      reportFilters({ range: "last-month" }, new Date("2024-03-15Z")),
    ).toMatchObject({ from: "2024-02-01", to: "2024-02-29" });
    expect(reportFilters({ range: "30" }, now)).toMatchObject({
      from: "2026-08-21",
      to: "2026-09-19",
    });
    expect(reportFilters({ range: "month" }, now).from).toBe("2026-09-01");
  });
  it("rejects invalid, reversed and future custom dates", () => {
    for (const [from, to] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-09-19", "2026-09-01"],
      ["2026-09-01", "2026-09-20"],
    ])
      expect(() => reportFilters({ range: "custom", from, to }, now)).toThrow();
  });
});
