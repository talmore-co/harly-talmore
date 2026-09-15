import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyCalSignature, CAL_WEBHOOK_TRIGGERS } from "@/lib/cal/client";
import {
  getPersonalCalSubscription,
  syncPersonalCalBooking,
} from "@/lib/cal/personal-bookings";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;
  if (!z.string().uuid().safeParse(subscriptionId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const subscription = await getPersonalCalSubscription(subscriptionId);
  if (!subscription)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = 256 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return NextResponse.json({ error: "Body too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (
    !verifyCalSignature(
      raw,
      request.headers.get("x-cal-signature-256"),
      subscription.subscription.webhookSecret,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: { triggerEvent?: string; payload?: { uid?: string } };
  try {
    event = z
      .object({
        triggerEvent: z.string().optional(),
        payload: z.object({ uid: z.string().optional() }).optional(),
      })
      .parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!CAL_WEBHOOK_TRIGGERS.some((trigger) => trigger === event.triggerEvent))
    return NextResponse.json({ ok: true, skipped: "unsupported event" });
  if (!z.string().min(1).max(200).safeParse(event.payload?.uid).success)
    return NextResponse.json({ error: "Missing booking UID" }, { status: 400 });
  try {
    const result = await syncPersonalCalBooking(
      subscriptionId,
      event.payload!.uid!,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { error: "Could not synchronize booking. Please retry." },
      { status: 503 },
    );
  }
}
