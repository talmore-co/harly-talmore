import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
export default async function CareerPageSettings() {
  await requirePagePermission("settings:edit");
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Career page</h2>
      <p className="text-sm text-muted-foreground">
        Edit your public job board, layout, branding and page content in the
        career-page editor.
      </p>
      <Button asChild>
        <Link href="/dashboard/career-page">Open career-page editor</Link>
      </Button>
    </section>
  );
}
