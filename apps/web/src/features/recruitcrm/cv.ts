import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { candidateFiles, candidates, db, recruitCrmImportItems as items } from "@harly/db";
import { safeFetchHttp } from "@/lib/ssrf";
import { storage } from "@/lib/storage";
import { privateResumeFileUrl } from "@/lib/resume/storage-key";
import { candidateSchema } from "./contracts";
import { CrmError } from "./client";

export async function copyCv(item: typeof items.$inferSelect, actorId: string, leaseId: string) {
  const resume = candidateSchema.parse(item.detail.profile).resume;
  let url = typeof resume === "string" ? resume : resume?.file_link;
  if (!url || !item.candidateId) return;
  const name = (typeof resume === "object" ? resume?.filename : null) || "Recruit CRM CV";
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (new URL(url).protocol !== "https:") throw new CrmError("CV URL must use HTTPS.");
    response = await safeFetchHttp(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location"); await response.body?.cancel();
      if (!next) throw new CrmError("CV download redirect is unavailable.");
      url = new URL(next, url).toString(); continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw new CrmError("Candidate imported, but CV download failed. Retry CV transfer.");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 10 * 1024 * 1024) throw new CrmError("Candidate imported, but CV exceeds the 10 MB limit."); chunks.push(part.value); } } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
  const docx = bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && (name.toLowerCase().endsWith(".docx") || response.headers.get("content-type")?.includes("wordprocessingml"));
  const doc = bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!pdf && !docx && !doc) throw new CrmError("Candidate imported, but CV is not a supported PDF, DOC or DOCX file.");
  const type = pdf ? "application/pdf" : docx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/msword";
  const extension = pdf ? "pdf" : docx ? "docx" : "doc";
  const key = `workspaces/${item.workspaceId}/resumes/recruitcrm-${item.id}-${leaseId}.${extension}`;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const [duplicate] = await db.select({ id: candidateFiles.id }).from(candidateFiles).where(and(eq(candidateFiles.workspaceId, item.workspaceId), eq(candidateFiles.candidateId, item.candidateId), eq(candidateFiles.contentHash, hash)));
  if (duplicate) return;
  await storage.put(key, bytes, type);
  try {
    const inserted = await db.transaction(async tx => {
      const [candidate] = await tx.select().from(candidates).where(and(eq(candidates.id, item.candidateId!), eq(candidates.workspaceId, item.workspaceId), isNull(candidates.deletedAt), isNull(candidates.anonymizedAt))).for("update");
      const [active] = await tx.select().from(items).where(and(eq(items.id, item.id), eq(items.leaseId, leaseId))).for("update");
      if (!candidate || !active) throw new CrmError("CV import is no longer eligible.");
      return tx.insert(candidateFiles).values({ id: item.id, workspaceId: item.workspaceId, candidateId: candidate.id, fileName: name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 180).replace(/\.(pdf|docx?)$/i, "") + `.${extension}`, fileUrl: privateResumeFileUrl(key), fileType: type, fileSize: bytes.length, contentHash: hash, uploadedById: actorId }).onConflictDoNothing().returning({ id: candidateFiles.id });
    });
    if (!inserted.length) await storage.delete(key);
  } catch (error) { await storage.delete(key); throw error; }
}
