"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";
import { Button } from "@/components/ui/button";
import { bulkGenerateAiEvaluationsForJobAction } from "@/features/candidates/ai-actions";
import type { PipelineApplication } from "./data";

export function RateRemainingApplications({
  jobId,
  applications,
  aiConfigured,
}: {
  jobId: string;
  applications: PipelineApplication[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const count = applications.filter(
    (application) =>
      application.status === "active" &&
      (application.aiScore == null ||
        (application.evaluationSource === "rules" &&
          application.evaluationEngineVersion !== "rules-v3")),
  ).length;
  if (!count) return null;
  async function rate() {
    setPending(true);
    let succeeded = 0,
      failed = 0;
    try {
      for (let batch = 0; batch < 100; batch++) {
        const result = await bulkGenerateAiEvaluationsForJobAction({ jobId });
        if (!result.success) {
          toast.error(
            result.reason === "not_configured"
              ? "Automatic evaluation is unavailable right now."
              : (result.error ?? "Could not evaluate applicants."),
          );
          return;
        }
        succeeded += result.succeeded;
        failed += result.failed;
        if (result.remaining === 0 || result.succeeded === 0) break;
      }
      if (succeeded || failed)
        toast.success(
          `Scored ${succeeded} candidate${succeeded === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`,
        );
      else toast.info("Everyone is already scored.");
    } catch {
      toast.error("Could not evaluate applicants. Try again shortly.");
    } finally {
      setPending(false);
      router.refresh();
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={rate}
      disabled={pending}
      title={`Evaluate ${count} remaining active applicants for this job, including those hidden by filters`}
    >
      <Users className="size-4" />
      {pending
        ? "Evaluating…"
        : aiConfigured
          ? "Rate the rest"
          : "Evaluate the rest"}
      <span className="text-muted-foreground">{count}</span>
    </Button>
  );
}
