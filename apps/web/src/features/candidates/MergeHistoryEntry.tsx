import { and, eq } from "drizzle-orm";
import { candidateMerges, db } from "@harly/db";
import { mergeContext } from "./merge-service";
import { CandidateMergeHistory } from "./CandidateMergeHistory";

export async function MergeHistoryEntry({
  candidateId,
}: {
  candidateId: string;
}) {
  const context = await mergeContext().catch(() => null);
  if (!context) return null;
  const [merge] = await db
    .select({ id: candidateMerges.id })
    .from(candidateMerges)
    .where(
      and(
        eq(candidateMerges.workspaceId, context.organization.id),
        eq(candidateMerges.candidateId, candidateId),
      ),
    )
    .limit(1);
  return merge ? (
    <div>
      <CandidateMergeHistory candidateId={candidateId} />
    </div>
  ) : null;
}
