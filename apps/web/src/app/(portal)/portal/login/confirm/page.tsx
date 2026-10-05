import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { confirmPortalMagicLinkAction } from "@/features/portal/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Continue to sign in",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type PortalLoginConfirmPageProps = {
  searchParams: Promise<{ token?: string }>;
};

/**
 * Opening an emailed sign-in link only shows this page. The one-time token is
 * used when the candidate submits the form, so a mail scanner that prefetches
 * the link does not sign anyone in or invalidate it.
 */
export default async function PortalLoginConfirmPage({
  searchParams,
}: PortalLoginConfirmPageProps) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) {
    redirect("/portal/login?error=missing_token" as Route);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-sm space-y-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Continue to sign in</h1>
          <p className="text-sm text-muted-foreground">
            Confirm to open your candidate portal. This link works once and
            expires 15 minutes after it was sent.
          </p>
        </div>
        <form action={confirmPortalMagicLinkAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit">Continue to sign in</Button>
        </form>
      </div>
    </main>
  );
}
