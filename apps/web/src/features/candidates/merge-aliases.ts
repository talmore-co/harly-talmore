import "server-only";
import { and, eq } from "drizzle-orm";
import { applicationMerges, candidateMerges, db } from "@harly/db";

export async function resolveMergedCandidateId(
  workspaceId: string,
  candidateId: string,
) {
  const [alias] = await db
    .select({ id: candidateMerges.candidateId })
    .from(candidateMerges)
    .where(
      and(
        eq(candidateMerges.workspaceId, workspaceId),
        eq(candidateMerges.sourceId, candidateId),
      ),
    );
  return alias?.id ?? candidateId;
}

export async function resolveMergedApplicationId(
  workspaceId: string,
  applicationId: string,
) {
  const [alias] = await db
    .select({ id: applicationMerges.applicationId })
    .from(applicationMerges)
    .where(
      and(
        eq(applicationMerges.workspaceId, workspaceId),
        eq(applicationMerges.sourceId, applicationId),
      ),
    );
  return alias?.id ?? applicationId;
}
