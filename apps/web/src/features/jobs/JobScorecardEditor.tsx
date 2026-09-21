"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  definitionSchema,
  definitionToken,
  type ScorecardDimension,
} from "@/features/candidates/scorecard-definition";
import { saveJobScorecard } from "@/features/candidates/scorecard-actions";
import { toast } from "@/lib/notification-island/toast";
import { useRouter } from "next/navigation";

export function JobScorecardEditor({
  jobId,
  definition,
  canEdit,
}: {
  jobId: string;
  definition: unknown;
  canEdit: boolean;
}) {
  const saved = definitionSchema.parse(definition);
  const [items, setItems] = useState(saved);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function update(index: number, changes: Partial<ScorecardDimension>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Changes apply to future assessments. Completed scorecards keep their
        original dimensions. Save this section with Save scorecard.
      </p>
      <div className="space-y-4">
        {items.map((item, index) => (
          <fieldset
            key={item.id}
            disabled={pending || !canEdit}
            className="space-y-3 rounded-lg border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Dimension {index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setItems((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  )
                }
              >
                Remove
              </Button>
            </div>
            <label className="block space-y-1 text-sm">
              Name
              <Input
                value={item.name}
                maxLength={120}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
            </label>
            <label className="block space-y-1 text-sm">
              Guidance
              <Textarea
                value={item.guidance}
                maxLength={2000}
                onChange={(event) =>
                  update(index, { guidance: event.target.value })
                }
                placeholder="What should the recruiter look for?"
              />
            </label>
            <Select
              value={item.type}
              onValueChange={(value) =>
                update(index, { type: value as ScorecardDimension["type"] })
              }
              disabled={pending || !canEdit}
            >
              <SelectTrigger
                aria-label={`Rating format for dimension ${index + 1}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommendation">
                  Strong / Mixed / Weak
                </SelectItem>
                <SelectItem value="scale">1–5 scale</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
              </SelectContent>
            </Select>
            {item.type === "scale" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Describe each scale rating so recruiters use the same
                  standard.
                </p>
                {item.anchors.map((anchor, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm">
                    <span>{i + 1}</span>
                    <Input
                      aria-label={`Dimension ${index + 1}, scale ${i + 1}`}
                      value={anchor}
                      maxLength={300}
                      onChange={(event) =>
                        update(index, {
                          anchors: item.anchors.map((text, n) =>
                            n === i ? event.target.value : text,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
        ))}
      </div>
      {!items.length ? (
        <p className="text-sm text-muted-foreground">
          No dimensions yet. Recruiters can still give an overall Strong, Mixed
          or Weak recommendation.
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || items.length >= 20}
            onClick={() =>
              setItems((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  guidance: "",
                  type: "recommendation",
                  anchors: ["", "", "", "", ""],
                },
              ])
            }
          >
            Add dimension
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveJobScorecard(
                  jobId,
                  items,
                  definitionToken(saved),
                );
                if (!result.success) return void toast.error(result.error);
                toast.success("Scorecard saved");
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save scorecard"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
