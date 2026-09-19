import { requirePermission } from "@/features/workspaces/permissions-server";
import { ClientEditor } from "@/features/clients/ClientEditor";
export default async function NewClientPage() {
  await requirePermission("clients:manage");
  return <div className="space-y-5"><h1 className="text-xl font-semibold">New client</h1><ClientEditor canManage /></div>;
}
