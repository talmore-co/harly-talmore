"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  attributionSchema,
  attributionFields,
} from "@/features/applications/attribution";
import type { PipelineApplication } from "./data";

export function matchesAttribution(value: unknown, query: string) {
  if (!query.trim()) return true;
  const parsed = attributionSchema.safeParse(value);
  return (
    parsed.success &&
    [parsed.data.first, parsed.data.last].some((touch) =>
      attributionFields.some((key) =>
        touch[key]?.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    )
  );
}

export function attributionCsv(applications: PipelineApplication[]) {
  const keys = [...attributionFields, "landingPath", "capturedAt"] as const;
  const header = [
    "Application ID",
    "Candidate",
    "Job",
    "Status",
    "Questionnaire score",
    "AI fit",
    ...["first", "last"].flatMap((kind) => keys.map((key) => `${kind}_${key}`)),
  ];
  const rows = applications.map((app) => {
    const parsed = attributionSchema.safeParse(app.attribution);
    return [
      app.id,
      `${app.candidateFirstName} ${app.candidateLastName}`,
      app.jobTitle,
      app.status,
      app.questionnaireScore ?? "",
      app.aiScore ?? "",
      ...(["first", "last"] as const).flatMap((kind) =>
        keys.map((key) =>
          parsed.success ? (parsed.data[kind][key] ?? "") : "",
        ),
      ),
    ];
  });
  return [header, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          const safe =
            /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)
              ? `'${text}`
              : text;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

export function AttributionControls({
  query,
  onChange,
  applications,
}: {
  query: string;
  onChange: (value: string) => void;
  applications: PipelineApplication[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Attribution</span>
        <Input
          className="h-10 w-64"
          placeholder="Source, campaign or ad ID"
          value={query}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <Button
        className="h-10"
        type="button"
        variant="outline"
        disabled={!applications.length}
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob(["\uFEFF", attributionCsv(applications)], {
              type: "text/csv;charset=utf-8",
            }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `application-attribution-${new Date().toISOString().slice(0, 10)}.csv`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Export filtered attribution
      </Button>
    </div>
  );
}
