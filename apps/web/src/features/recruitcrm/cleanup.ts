import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@harly/db";

/** Include unsubmitted previews and queued copies of the same source identity. */
export async function eraseRecruitCrmCandidate(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], workspaceId: string, candidateId: string) {
  await tx.execute(sql`delete from recruitcrm_import_items i using candidates c
    where c.id = ${candidateId}::uuid and c.workspace_id = ${workspaceId} and i.workspace_id = c.workspace_id
    and (i.candidate_id = c.id
      or (c.email is not null and lower(i.snapshot->>'email') = lower(c.email))
      or (c.linkedin_url is not null and lower(rtrim(i.snapshot->>'linkedin', '/')) = lower(rtrim(c.linkedin_url, '/')))
      or exists (select 1 from recruitcrm_candidate_links l join recruitcrm_import_batches b on b.connection_id = l.connection_id
        where l.workspace_id = c.workspace_id and l.candidate_id = c.id and b.id = i.batch_id and l.external_slug = i.external_slug))`);
  await tx.execute(sql`update activity_events set metadata = '{"source":"recruitcrm","redacted":true}'::jsonb
    where workspace_id = ${workspaceId} and type = 'recruitcrm.imported'
    and (entity_id = ${candidateId}::uuid or entity_id in (select id from applications where workspace_id = ${workspaceId} and candidate_id = ${candidateId}::uuid))`);
}
