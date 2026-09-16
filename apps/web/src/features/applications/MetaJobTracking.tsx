import { db, workspaceSettings } from "@harly/db";
import { eq } from "drizzle-orm";
import { MetaJobTracker } from "./MetaJobTracker";
export async function MetaJobTracking({
  workspaceId,
  jobId,
}: {
  workspaceId: string;
  jobId: string;
}) {
  const [settings] = await db
    .select({ pixelId: workspaceSettings.metaPixelId })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId));
  return settings?.pixelId ? (
    <MetaJobTracker pixelId={settings.pixelId} jobId={jobId} />
  ) : null;
}
