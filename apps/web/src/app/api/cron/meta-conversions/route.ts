import { NextResponse, type NextRequest } from "next/server";
import { dispatchMetaConversions } from "@/lib/meta/conversions";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, "meta-conversions");
  if (!auth.ok) return auth.response;
  const run = startCronRun("meta-conversions");
  try {
    const counts = await dispatchMetaConversions();
    await run.finish(counts.failed ? "failed" : "succeeded", counts);
    return NextResponse.json({ ok: true, ...counts });
  } catch {
    await run.finish("failed");
    return NextResponse.json({ ok: false }, { status: 503 });
  } finally {
    await auth.release();
  }
}
