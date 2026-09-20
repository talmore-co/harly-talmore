import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { listPlacements } from "@/features/placements/data";
import { PlacementsList } from "@/features/placements/PlacementsList";

export const dynamic = "force-dynamic";

export default async function PlacementsPage() {
  await requirePagePermission("candidates:view");
  return <PlacementsList placements={await listPlacements()} />;
}
