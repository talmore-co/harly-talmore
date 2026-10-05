import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { Route } from "next";

export const runtime = "nodejs";

/**
 * Sign-in links that were emailed before the confirmation step still point
 * here. Opening a link must not use it up, because mail scanners prefetch
 * links, so hand over to the confirmation page, where the candidate submits
 * the token themselves.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) redirect("/portal/login?error=missing_token" as Route);

  redirect(
    `/portal/login/confirm?token=${encodeURIComponent(token!)}` as Route,
  );
}
