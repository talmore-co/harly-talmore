import "server-only";
import { and, eq } from "drizzle-orm";
import { db, recruitCrmConnections as connections } from "@harly/db";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto";

export class CrmError extends Error {}
export class CrmRetry extends CrmError { constructor(message: string, public retryAt = new Date(Date.now() + 60_000)) { super(message); } }
export async function crmRequest<T>(token: string, path: string, schema: z.ZodType<T>): Promise<T> {
  try {
    const response = await fetch(`https://api.recruitcrm.io/v1/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      throw new CrmRetry("Recruit CRM is rate limiting requests. Import will resume automatically.", new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60) * 1000));
    }
    if (response.status >= 500) throw new CrmRetry("Recruit CRM is temporarily unavailable.");
    if (!response.ok) throw new CrmError(response.status === 401 || response.status === 403 ? "Check the Recruit CRM token and account permissions." : "The Recruit CRM record is unavailable.");
    const reader = response.body?.getReader();
    if (!reader) throw new CrmError("Recruit CRM returned an empty response.");
    const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 5_000_000) throw new CrmError("Recruit CRM response is too large. Narrow your search."); chunks.push(part.value); } } finally { await reader.cancel(); }
    const result = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!result.success) throw new CrmError("Recruit CRM returned an unexpected response format.");
    return result.data;
  } catch (error) { if (error instanceof CrmError) throw error; throw new CrmRetry("Could not reach Recruit CRM."); }
}

export async function connected(workspaceId: string, connectionId: string) {
  const [row] = await db.select().from(connections).where(and(eq(connections.workspaceId, workspaceId), eq(connections.id, connectionId)));
  if (!row?.token) throw new CrmError("Connect this Recruit CRM account in Settings → Integrations first.");
  return row;
}

/** A shared request budget covers browsing and workers for this saved account. */
export async function request<T>(workspaceId: string, connectionId: string, revision: string, path: string, schema: z.ZodType<T>) {
  const encrypted = await db.transaction(async tx => {
    const [row] = await tx.select().from(connections).where(and(eq(connections.workspaceId, workspaceId), eq(connections.id, connectionId))).for("update");
    if (!row?.token || row.revision !== revision) throw new CrmError("The Recruit CRM connection changed. Load a fresh preview.");
    const now = Date.now();
    if (row.retryAt && row.retryAt.getTime() > now) throw new CrmRetry("Recruit CRM requests are cooling down.", row.retryAt);
    const reset = now - row.rateWindowAt.getTime() >= 60_000;
    if (!reset && row.rateCount >= 45) throw new CrmRetry("Recruit CRM request budget reached. Import will resume automatically.", new Date(row.rateWindowAt.getTime() + 60_000));
    await tx.update(connections).set({ rateCount: reset ? 1 : row.rateCount + 1, rateWindowAt: reset ? new Date() : row.rateWindowAt }).where(eq(connections.id, connectionId));
    return row.token;
  });
  try { return await crmRequest(decryptSecret(encrypted), path, schema); }
  catch (error) { if (error instanceof CrmRetry) await db.update(connections).set({ retryAt: error.retryAt }).where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId), eq(connections.revision, revision))); throw error; }
}
