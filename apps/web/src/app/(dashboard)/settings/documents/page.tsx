import Link from "next/link";
import {
  requirePagePermission,
  can,
} from "@/features/workspaces/permissions-server";
import { listDocumentCategories } from "@/features/documents/data";
import { DocumentSettings } from "@/features/documents/DocumentSettings";
export default async function DocumentSettingsPage() {
  await requirePagePermission("documents:manage");
  const categories = await listDocumentCategories();
  return (
    <div className="space-y-6">
      <DocumentSettings categories={categories} />
      <div className="flex flex-wrap gap-4 text-sm">
        {(await can("settings:edit")) || (await can("dsar:manage")) ? (
          <Link className="underline" href="/settings/legal">
            Retention & privacy settings
          </Link>
        ) : null}
        {(await can("settings:edit")) ? (
          <Link className="underline" href="/settings/signature">
            Signature settings
          </Link>
        ) : null}
        {(await can("documents:read")) ? (
          <Link className="underline" href="/dashboard/documents">
            Open document library
          </Link>
        ) : null}
      </div>
    </div>
  );
}
