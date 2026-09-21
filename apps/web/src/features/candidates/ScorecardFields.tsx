"use client";

import { useEffect, useState } from "react";
import { getApplicationScorecard } from "./scorecard-actions";
import type {
  ScorecardDimension,
  ScorecardSubmission,
  DimensionResponse,
} from "./scorecard-definition";
import { RatingChoices } from "./RatingChoices";
import { Textarea } from "@/components/ui/textarea";

export function ScorecardFields({
  applicationId,
  candidateId,
  value,
  onChange,
  disabled,
}: {
  applicationId: string;
  candidateId: string;
  value: ScorecardSubmission | undefined;
  onChange: (value: ScorecardSubmission | undefined) => void;
  disabled?: boolean;
}) {
  const [dimensions, setDimensions] = useState<ScorecardDimension[] | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    onChange(undefined);
    getApplicationScorecard(applicationId, candidateId)
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setError(result.error);
          return;
        }
        setDimensions(result.dimensions);
        onChange({
          definitionToken: result.definitionToken,
          responses: result.dimensions.map((item) => ({
            id: item.id,
            value: null,
            comment: "",
          })),
        });
      })
      .catch(() => {
        if (active)
          setError("Could not load scorecard. Close and reopen to retry.");
      });
    return () => {
      active = false;
    };
  }, [applicationId, candidateId, onChange]);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!dimensions || !value)
    return <p className="text-sm text-muted-foreground">Loading scorecard…</p>;
  function change(id: string, patch: Partial<DimensionResponse>) {
    if (value)
      onChange({
        ...value,
        responses: value.responses.map((response) =>
          response.id === id ? { ...response, ...patch } : response,
        ),
      });
  }
  return (
    <div className="space-y-4">
      {dimensions.map((dimension) => {
        const response = value.responses.find(
          (item) => item.id === dimension.id,
        );
        return (
          <section
            key={dimension.id}
            className="space-y-2 rounded-lg border p-3"
          >
            <h4 className="text-sm font-medium">{dimension.name}</h4>
            {dimension.guidance ? (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                {dimension.guidance}
              </p>
            ) : null}
            <RatingChoices
              type={dimension.type}
              value={response?.value ?? null}
              onChange={(value) => change(dimension.id, { value })}
              label={dimension.name}
              anchors={dimension.anchors}
              disabled={disabled}
            />
            <Textarea
              aria-label={`Evidence for ${dimension.name}`}
              placeholder="Supporting evidence or notes (optional)"
              value={response?.comment ?? ""}
              maxLength={3000}
              disabled={disabled}
              onChange={(event) =>
                change(dimension.id, { comment: event.target.value })
              }
            />
          </section>
        );
      })}
    </div>
  );
}
