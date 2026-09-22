import { ArrowRight, GitBranch } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

import type { PipelineOverview } from "@/features/dashboard/widgets";
import { Tile, TileHeader, EmptyHint } from "./primitives";
import { PipelineJobSelect } from "./PipelineJobSelect";
import { pipelineStageColor as stageColor } from "@/features/pipeline/stage-color";

export function PipelineOverviewCard({
  data,
  className,
}: {
  data: PipelineOverview;
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={GitBranch}
        title="Pipeline overview"
        action={
          data.selected ? (
            <div className="min-w-0 max-w-[50%]">
              <PipelineJobSelect
                jobs={data.jobs}
                selectedId={data.selected.id}
              />
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-3">
        {data.selected ? (
          <>
            <p className="truncate text-sm font-medium">
              {data.selected.title}
            </p>

            {/* Segmented funnel bar */}
            <div className="flex h-2.5 w-full gap-1 overflow-hidden">
              {data.total > 0 ? (
                data.stages.map((stage) =>
                  stage.count > 0 ? (
                    <div
                      key={stage.name}
                      className="h-full rounded-full"
                      style={{
                        width: `${(stage.count / data.total) * 100}%`,
                        backgroundColor: stageColor(stage),
                      }}
                    />
                  ) : null,
                )
              ) : (
                <div className="h-full w-full rounded-full bg-muted" />
              )}
            </div>

            {/* Stage counts */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              {data.stages.map((stage) => (
                <Link key={stage.name} href={`/dashboard/pipeline?jobId=${data.selected!.id}&stage=${encodeURIComponent(stage.name)}`} className="min-w-0 rounded-md p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start gap-1.5">
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: stageColor(stage),
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {stage.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {stage.count}
                  </p>
                </Link>
              ))}
            </div>

            <div className="mt-auto border-t border-hairline pt-4">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/dashboard/pipeline?jobId=${data.selected.id}`}>
                  View pipeline
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <EmptyHint
            icon={GitBranch}
            text="No open jobs yet. Publish a role to start a pipeline."
          />
        )}
      </div>
    </Tile>
  );
}
