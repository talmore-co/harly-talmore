import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { candidates, db } from "@harly/db";

import { detectDuplicatesWithAI } from "@/lib/ai/surfaces/detect-duplicates";
import type { AiModelConfig } from "@/lib/ai/providers";
import { duplicateSuspects } from "./duplicate-signals";

export type DuplicateMatch = {
  candidateId: string;
  confidence: "high" | "medium";
  reason: string;
  fullName: string;
  email: string;
};

/**
 * Session-free duplicate detector shared by the manual action and application
 * intake automation. Database candidates are always workspace-scoped and model
 * IDs are checked against the suspect set before anything is returned.
 */
export async function detectCandidateDuplicatesForWorkspace(input: {
  workspaceId: string;
  candidateId: string;
  config: AiModelConfig;
  otherCandidateId?: string;
}): Promise<DuplicateMatch[]> {
  const [target] = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
      skills: candidates.skills,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        eq(candidates.id, input.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!target) return [];
  const signals = await duplicateSuspects(input.workspaceId, input.candidateId, input.otherCandidateId);
  const ids = signals.filter((row) => !input.otherCandidateId || row.candidateId === input.otherCandidateId).map((row) => row.candidateId);
  if (!ids.length) return [];

  const suspects = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
      skills: candidates.skills,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        inArray(candidates.id, ids),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(10);

  if (suspects.length === 0) return [];

  const result = await detectDuplicatesWithAI(input.config, {
    target: {
      candidateId: target.id,
      fullName: `${target.firstName} ${target.lastName}`,
      email: target.email ?? "",
      headline: target.headline,
      skills: Array.isArray(target.skills) ? (target.skills as string[]) : [],
    },
    suspects: suspects.map((suspect) => ({
      candidateId: suspect.id,
      fullName: `${suspect.firstName} ${suspect.lastName}`,
      email: suspect.email ?? "",
      headline: suspect.headline,
      skills: Array.isArray(suspect.skills) ? (suspect.skills as string[]) : [],
    })),
  });

  const suspectsById = new Map(
    suspects.map((suspect) => [suspect.id, suspect]),
  );
  return result.matches.flatMap((match) => {
    const suspect = suspectsById.get(match.candidateId);
    if (!suspect) return [];
    return [
      {
        candidateId: suspect.id,
        confidence: match.confidence,
        reason: match.reason,
        fullName: `${suspect.firstName} ${suspect.lastName}`,
        email: suspect.email ?? "",
      },
    ];
  });
}
