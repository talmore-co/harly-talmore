import { describe, expect, it } from "vitest";
import type { Job } from "@harly/db";

import { defaultJobApplicationConfig } from "./config";
import { buildDuplicateJobValues } from "./duplicate";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    workspaceId: "ws-1",
    title: "Senior Engineer",
    clientId: "client-1",
    takenOn: "2026-01-10",
    scorecardDefinition: [],
    slug: "senior-engineer",
    department: "Engineering",
    location: "Berlin",
    employmentType: "full_time",
    workplaceType: "hybrid",
    description: "<p>Build the product.</p>",
    requirements: null,
    benefits: null,
    contentSections: [{ id: "s1", title: "What you do", body: "<p>Ship.</p>" }],
    sector: "Software",
    experienceLevel: "senior",
    education: null,
    evaluationMode: "strict",
    keywords: ["typescript", "postgres"],
    salaryMin: 80000,
    salaryMax: 100000,
    currency: "EUR",
    salaryPeriod: "annual",
    officeAddress: "Example Street 1",
    officeLat: 52.5,
    officeLng: 13.4,
    officePhotos: ["https://example.test/office.jpg"],
    jobLocationCountry: "DE",
    jobLocationRegion: "Berlin",
    remoteEligibleCountries: ["DE", "AT"],
    validThrough: new Date("2026-03-01T00:00:00Z"),
    applicationConfig: {
      ...defaultJobApplicationConfig,
      questions: [
        { id: "q1", label: "Why us?", type: "textarea", required: true },
      ],
    },
    boardConfig: {},
    status: "open",
    publishedAt: new Date("2026-01-12T00:00:00Z"),
    deletedAt: null,
    createdById: "user-1",
    createdAt: new Date("2026-01-10T00:00:00Z"),
    updatedAt: new Date("2026-01-12T00:00:00Z"),
    ...overrides,
  } as Job;
}

describe("buildDuplicateJobValues", () => {
  it("suffixes the title and lets the slug be regenerated", () => {
    const values = buildDuplicateJobValues(job());
    expect(values.title).toBe("Senior Engineer (copy)");
    expect(values.slug).toBeUndefined();
  });

  it("copies the job's content and settings", () => {
    const values = buildDuplicateJobValues(job());
    expect(values).toMatchObject({
      department: "Engineering",
      sector: "Software",
      location: "Berlin",
      employmentType: "full_time",
      workplaceType: "hybrid",
      experienceLevel: "senior",
      evaluationMode: "strict",
      keywords: ["typescript", "postgres"],
      description: "<p>Build the product.</p>",
      contentSections: [{ id: "s1", title: "What you do", body: "<p>Ship.</p>" }],
      salaryMin: 80000,
      salaryMax: 100000,
      currency: "EUR",
      salaryPeriod: "annual",
      officeAddress: "Example Street 1",
      jobLocationCountry: "DE",
      jobLocationRegion: "Berlin",
      remoteEligibleCountries: ["DE", "AT"],
      officePhotos: ["https://example.test/office.jpg"],
    });
    expect(values.applicationConfig.questions).toHaveLength(1);
    expect(values.applicationConfig.questions[0]).toMatchObject({
      id: "q1",
      label: "Why us?",
    });
  });

  it("carries no publication state into the copy", () => {
    const values = buildDuplicateJobValues(job());
    expect(values.validThrough).toBeUndefined();
    expect(values).not.toHaveProperty("status");
    expect(values).not.toHaveProperty("publishedAt");
  });

  it("turns nullable columns into omitted form values", () => {
    const values = buildDuplicateJobValues(
      job({
        department: null,
        location: null,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        salaryPeriod: null,
        remoteEligibleCountries: null as unknown as Job["remoteEligibleCountries"],
      }),
    );
    expect(values.department).toBeUndefined();
    expect(values.location).toBeUndefined();
    expect(values.salaryMin).toBeUndefined();
    expect(values.salaryPeriod).toBeUndefined();
    expect(values.remoteEligibleCountries).toEqual([]);
  });

  it("migrates legacy requirements and benefits into sections", () => {
    const values = buildDuplicateJobValues(
      job({
        contentSections: [],
        requirements: "<p>5 years</p>",
        benefits: "<p>Remote budget</p>",
      }),
    );
    expect(values.contentSections).toEqual([
      { id: "migrated-req", title: "Requirements", body: "<p>5 years</p>" },
      { id: "migrated-ben", title: "Benefits", body: "<p>Remote budget</p>" },
    ]);
  });

  it("falls back to safe defaults for unrecognised stored values", () => {
    const values = buildDuplicateJobValues(
      job({
        evaluationMode: "legacy-mode",
        salaryPeriod: "weekly",
        applicationConfig: {},
      }),
    );
    expect(values.evaluationMode).toBe("balanced");
    expect(values.salaryPeriod).toBeUndefined();
    expect(values.applicationConfig).toEqual(defaultJobApplicationConfig);
  });
});
