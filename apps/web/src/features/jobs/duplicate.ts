import type { Job } from "@harly/db";

import {
  DEFAULT_EVALUATION_MODE,
  EVALUATION_MODES,
  type EvaluationMode,
} from "@/lib/evaluation/mode";
import {
  normalizeJobApplicationConfig,
  normalizeJobBoardConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type JobContentSection,
} from "./config";
import type { JobFormValues } from "./validation";

export const DUPLICATE_TITLE_SUFFIX = " (copy)";

/** Legacy jobs keep requirements/benefits in their own columns; the job form
 * migrates them into content sections, so a copy has to do the same. */
function duplicateContentSections(job: Job): JobContentSection[] {
  const sections = parseJobContentSections(job.contentSections);
  if (sections.length > 0) return sections;
  const migrated: JobContentSection[] = [];
  if (job.requirements)
    migrated.push({
      id: "migrated-req",
      title: "Requirements",
      body: job.requirements,
    });
  if (job.benefits)
    migrated.push({ id: "migrated-ben", title: "Benefits", body: job.benefits });
  return migrated;
}

/**
 * Values for a copy of `job`, in the shape the normal job creation service
 * takes. Posting-specific state is deliberately left out: the slug is
 * regenerated from the new title, and the expiry date is not carried over so
 * a copy of an old job is not born expired.
 */
export function buildDuplicateJobValues(job: Job): JobFormValues {
  const countries = Array.isArray(job.remoteEligibleCountries)
    ? job.remoteEligibleCountries.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    title: `${job.title}${DUPLICATE_TITLE_SUFFIX}`,
    slug: undefined,
    department: job.department ?? undefined,
    sector: job.sector ?? undefined,
    location: job.location ?? undefined,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    experienceLevel: job.experienceLevel ?? undefined,
    education: job.education ?? undefined,
    evaluationMode: (EVALUATION_MODES as readonly string[]).includes(
      job.evaluationMode,
    )
      ? (job.evaluationMode as EvaluationMode)
      : DEFAULT_EVALUATION_MODE,
    keywords: parseKeywords(job.keywords),
    description: job.description,
    contentSections: duplicateContentSections(job),
    salaryMin: job.salaryMin ?? undefined,
    salaryMax: job.salaryMax ?? undefined,
    currency: job.currency ?? undefined,
    salaryPeriod:
      job.salaryPeriod === "annual" || job.salaryPeriod === "monthly"
        ? job.salaryPeriod
        : undefined,
    officeAddress: job.officeAddress ?? undefined,
    jobLocationCountry: job.jobLocationCountry ?? undefined,
    jobLocationRegion: job.jobLocationRegion ?? undefined,
    remoteEligibleCountries: countries,
    validThrough: undefined,
    officePhotos: parseOfficePhotos(job.officePhotos),
    applicationConfig: normalizeJobApplicationConfig(job.applicationConfig),
    boardConfig: normalizeJobBoardConfig(job.boardConfig),
  };
}
