import "server-only";

import { and, asc, desc, eq, exists, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  applications,
  candidates,
  candidateTags,
  jobs,
  jobStages,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import type { CandidateDirectoryFilters } from "./data";

/** How many candidates to look at on each side of the open profile. */
const NEIGHBOUR_WINDOW = 5;

export type CandidateDirectoryNeighbours = {
  /** 1-based position in the filtered directory, null when not part of it. */
  position: number | null;
  total: number;
  /** Candidate ids before the profile, nearest first. */
  previousIds: string[];
  /** Candidate ids after the profile, nearest first. */
  nextIds: string[];
};

/**
 * Ranks the directory with the same filters and ordering as
 * `listCandidateDirectory` (keep the two in sync), then returns only the rows
 * around one candidate. Exported so the generated SQL can be asserted.
 */
export function candidateDirectoryNeighboursQuery(
  workspaceId: string,
  candidateId: string,
  input: CandidateDirectoryFilters = {},
) {
  const query = input.query?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
  const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
  const like = `%${escapedQuery}%`;

  const latestApplication = db
    .selectDistinctOn([applications.candidateId], {
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      status: applications.status,
      source: applications.source,
      appliedAt: applications.appliedAt,
      currentStageId: applications.currentStageId,
    })
    .from(applications)
    .where(eq(applications.workspaceId, workspaceId))
    .orderBy(
      asc(applications.candidateId),
      desc(applications.appliedAt),
      desc(applications.id),
    )
    .as("latest_application");

  const predicates = [
    eq(candidates.workspaceId, workspaceId),
    isNull(candidates.deletedAt),
  ];
  if (query) {
    predicates.push(
      or(
        ilike(candidates.firstName, like),
        ilike(candidates.lastName, like),
        ilike(candidates.email, like),
        ilike(candidates.phone, like),
        ilike(candidates.headline, like),
        ilike(candidates.location, like),
        ilike(jobs.title, like),
        ilike(jobs.department, like),
      )!,
    );
  }
  if (input.department) predicates.push(eq(jobs.department, input.department));
  if (input.role) predicates.push(eq(jobs.title, input.role));
  if (input.stage) predicates.push(eq(jobStages.name, input.stage));
  if (input.status) predicates.push(eq(latestApplication.status, input.status));
  if (input.source) predicates.push(eq(latestApplication.source, input.source));
  if (input.tag) {
    predicates.push(
      exists(
        db
          .select({ id: candidateTags.id })
          .from(candidateTags)
          .where(
            and(
              eq(candidateTags.workspaceId, workspaceId),
              eq(candidateTags.candidateId, candidates.id),
              eq(candidateTags.label, input.tag),
            ),
          ),
      ),
    );
  }

  const ordering =
    input.sort === "name"
      ? [asc(candidates.lastName), asc(candidates.firstName), asc(candidates.id)]
      : input.sort === "oldest"
        ? [asc(latestApplication.appliedAt), asc(candidates.id)]
        : input.sort === "modified"
          ? [desc(candidates.updatedAt), desc(candidates.id)]
          : [
              desc(sql`greatest(${candidates.updatedAt}, coalesce(${latestApplication.appliedAt}, ${candidates.updatedAt}))`),
              desc(candidates.id),
            ];

  const ranked = db.$with("ranked_candidates").as(
    db
      .select({
        id: candidates.id,
        position:
          sql<number>`(row_number() over (order by ${sql.join(ordering, sql`, `)}))::int`.as(
            "position",
          ),
        total: sql<number>`(count(*) over ())::int`.as("total"),
      })
      .from(candidates)
      .leftJoin(
        latestApplication,
        eq(latestApplication.candidateId, candidates.id),
      )
      .leftJoin(
        jobs,
        and(
          eq(jobs.id, latestApplication.jobId),
          eq(jobs.workspaceId, workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .leftJoin(
        jobStages,
        and(
          eq(jobStages.id, latestApplication.currentStageId),
          eq(jobStages.workspaceId, workspaceId),
        ),
      )
      .where(and(...predicates)),
  );

  const window = sql.raw(String(NEIGHBOUR_WINDOW));
  const anchor = sql`(select ${ranked.position} from ${ranked} where ${ranked.id} = ${candidateId})`;
  return db
    .with(ranked)
    .select({ id: ranked.id, position: ranked.position, total: ranked.total })
    .from(ranked)
    .where(
      sql`${ranked.position} between ${anchor} - ${window} and ${anchor} + ${window}`,
    )
    .orderBy(asc(ranked.position));
}

/** Position of a candidate in the directory plus the ids right around it. */
export async function getCandidateDirectoryNeighbours(
  candidateId: string,
  input: CandidateDirectoryFilters = {},
): Promise<CandidateDirectoryNeighbours> {
  const { organization: workspace } = await getWorkspaceContext();
  const rows = await candidateDirectoryNeighboursQuery(
    workspace.id,
    candidateId,
    input,
  );
  return neighboursFromRankedRows(candidateId, rows);
}

export function neighboursFromRankedRows(
  candidateId: string,
  rows: { id: string; position: number; total: number }[],
): CandidateDirectoryNeighbours {
  const index = rows.findIndex((row) => row.id === candidateId);
  if (index < 0) {
    return { position: null, total: 0, previousIds: [], nextIds: [] };
  }
  return {
    position: Number(rows[index]!.position),
    total: Number(rows[index]!.total),
    previousIds: rows
      .slice(0, index)
      .reverse()
      .map((row) => row.id),
    nextIds: rows.slice(index + 1).map((row) => row.id),
  };
}
