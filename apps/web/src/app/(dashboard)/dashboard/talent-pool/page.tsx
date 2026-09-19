import { listPoolCandidates, listOpenJobs } from "@/features/pool/data";
import { PoolView } from "@/features/pool/PoolView";
import { DirectoryNavigation } from "@/features/candidates/DirectoryNavigation";

export default async function TalentPoolPage() {
  const [candidates, openJobs] = await Promise.all([
    listPoolCandidates(),
    listOpenJobs(),
  ]);

  return (
    <div className="space-y-6">
      <DirectoryNavigation active="pool" />
      <PoolView candidates={candidates} openJobs={openJobs} />
    </div>
  );
}
