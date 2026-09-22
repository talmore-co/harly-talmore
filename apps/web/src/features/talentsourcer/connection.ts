import "server-only";
import { db, talentSourcerConnections } from "@harly/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { connectionSchema, sourceRequest, TalentSourcerError } from "./client";

export async function connectionStatus(workspaceId: string) {
  const rows = await db.select({ organizationId: talentSourcerConnections.organizationId, organizationName: talentSourcerConnections.organizationName, checkedAt: talentSourcerConnections.checkedAt, connected: sql<boolean>`${talentSourcerConnections.token} is not null` }).from(talentSourcerConnections).where(eq(talentSourcerConnections.workspaceId, workspaceId)).orderBy(asc(talentSourcerConnections.organizationName), asc(talentSourcerConnections.organizationId));
  return { connected: rows.some(row => row.connected), connections: rows.map(row => ({ ...row, checkedAt: row.checkedAt?.toISOString() ?? null })) };
}

export async function verifiedConnection(workspaceId: string, organizationId: string) {
  const [row] = await db.select().from(talentSourcerConnections).where(and(eq(talentSourcerConnections.workspaceId, workspaceId), eq(talentSourcerConnections.organizationId, organizationId)));
  if (!row?.token) throw new TalentSourcerError("Connect TalentSourcer in Settings → Integrations first.");
  const token = decryptSecret(row.token);
  const identity = await sourceRequest(token, "connection", connectionSchema);
  if (identity.organization.id !== row.organizationId) throw new TalentSourcerError("The connected TalentSourcer workspace changed. Reconnect before importing.");
  return { ...row, token };
}
