import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { importFathomWebhook } from "@/lib/fathom/import";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await context.params;
  if (!z.string().uuid().safeParse(connectionId).success)
    return new NextResponse(null, { status: 404 });
  const limit = 4 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return new NextResponse(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return new NextResponse(null, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const result = await importFathomWebhook(
      connectionId,
      Buffer.concat(chunks).toString("utf8"),
      request.headers,
    );
    if (result === "unauthorized")
      return new NextResponse(null, { status: 401 });
    if (result === "invalid") return new NextResponse(null, { status: 400 });
    // Unmatched meetings are acknowledged without storing their payload or creating an inbox.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Import temporarily unavailable" },
      { status: 503 },
    );
  }
}
