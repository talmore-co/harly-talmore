import "server-only";
import { z } from "zod";
import { recruitCrmImportBatches } from "@harly/db";
import { candidateSchema, pageSchema } from "./contracts";
import { CrmError, request } from "./client";

export type SourceSelection = typeof recruitCrmImportBatches.$inferSelect.source;
export async function sourcePage(workspaceId: string, connectionId: string, revision: string, source: SourceSelection, page: number, limit: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (source.kind === "job") {
    if (!source.jobSlug) throw new CrmError("Select a Recruit CRM job.");
    if (source.statusId) params.set("status_id", source.statusId);
    const result = await request(workspaceId, connectionId, revision, `jobs/${encodeURIComponent(source.jobSlug)}/assigned-candidates?${params}`, pageSchema(z.object({ candidate: candidateSchema, status: z.object({ label: z.string().optional() }).optional() })));
    return { ...result, data: result.data.map(row => ({ ...row.candidate, sourceStage: row.status?.label })) };
  }
  params.set("sort_by", "createdon"); params.set("sort_order", "asc");
  if (source.query && source.field) params.set(source.field, source.query);
  if (source.ownerId) params.set("owner_id", source.ownerId);
  return request(workspaceId, connectionId, revision, `candidates${source.query || source.ownerId ? "/search" : ""}?${params}`, pageSchema(candidateSchema));
}
