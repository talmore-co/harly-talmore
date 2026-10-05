import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ilike, or } from "drizzle-orm";

import { candidateFiles, db } from "@harly/db";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  PORTAL_SESSION_COOKIE,
  resolvePortalSession,
} from "@/lib/portal-auth";
import { requireCandidatePermission } from "@/features/workspaces/permissions-server";
import { storage } from "@/lib/storage";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function contentTypeFor(key: string) {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function containsPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * A stored file URL holds the storage key either verbatim (upload paths, S3
 * URLs) or percent-encoded in a `key` query parameter. Let the database narrow
 * the rows to those forms rather than scanning a capped slice of the
 * workspace, then confirm the exact key with the same parser as before.
 */
async function findCandidateFileForKey(workspaceId: string, key: string) {
  const encodings = new Set([
    key,
    encodeURIComponent(key),
    new URLSearchParams({ key }).toString().slice("key=".length),
  ]);
  const rows = await db
    .select({ candidateId: candidateFiles.candidateId, fileUrl: candidateFiles.fileUrl })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, workspaceId),
        or(
          ...[...encodings].map((value) =>
            ilike(candidateFiles.fileUrl, containsPattern(value)),
          ),
        ),
      ),
    )
    .limit(100);

  return (
    rows.find((row) => resumeKeyFromUrl(row.fileUrl) === key) ?? null
  );
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("key");
  const key = requested ? resumeKeyFromUrl(requested) : null;
  if (!key) return new NextResponse("Not found", { status: 404 });

  const keyWorkspaceId = key.match(/^workspaces\/([^/]+)\/resumes\//)?.[1] ?? null;
  const context = await getWorkspaceContextOrNull();
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  const portal = token ? await resolvePortalSession(token) : null;
  const workspaceId = keyWorkspaceId ?? context?.organization.id ?? portal?.workspaceId;
  if (!workspaceId) return new NextResponse("Not found", { status: 404 });

  if (
    keyWorkspaceId &&
    context?.organization.id !== keyWorkspaceId &&
    portal?.workspaceId !== keyWorkspaceId
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await findCandidateFileForKey(workspaceId, key);
  let allowed = false;

  if (file && context?.organization.id === workspaceId) {
    try {
      await requireCandidatePermission("candidates:view", file.candidateId);
      allowed = true;
    } catch {
      // Keep the response indistinguishable from a missing file. This
      // prevents a scoped recruiter from probing candidate file keys.
    }
  }

  if (!allowed && file && portal?.workspaceId === workspaceId) {
    allowed = file.candidateId === portal.candidateId;
  }

  if (!allowed) return new NextResponse("Not found", { status: 404 });

  try {
    const file = await storage.read(key);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": contentTypeFor(key),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
