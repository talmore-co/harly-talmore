import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BookingPageError,
  confirmPooledBooking,
  getPooledBookingPage,
} from "@/lib/cal/pooled-booking";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("availability"),
    token: z.string().max(100),
    from: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("confirm"),
    token: z.string().max(100),
    start: z.string().datetime(),
    timeZone: z.string().min(1).max(100),
  }),
]);
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function POST(request: Request) {
  try {
    await enforceRateLimit(`public:pooled-booking:${clientIp(request)}`, {
      limit: 30,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429, headers },
    );
  }
  // Tokens travel in the POST body, never access-log URLs or referrer headers.
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "This booking request is invalid." },
      { status: 400, headers },
    );
  try {
    const result =
      input.data.action === "confirm"
        ? await confirmPooledBooking(
            input.data.token,
            input.data.start,
            input.data.timeZone,
          )
        : await getPooledBookingPage(input.data.token, input.data.from);
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BookingPageError
            ? error.message
            : "We could not load your booking. Please try again shortly.",
      },
      { status: error instanceof BookingPageError ? 409 : 503, headers },
    );
  }
}
