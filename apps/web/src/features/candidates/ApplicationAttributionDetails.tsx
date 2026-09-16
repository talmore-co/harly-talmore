import {
  attributionFields,
  attributionSchema,
} from "@/features/applications/attribution";

export function ApplicationAttributionDetails({ value }: { value: unknown }) {
  const parsed = attributionSchema.safeParse(value);
  if (!parsed.success) return null;
  return (
    <details className="mt-3 rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Attribution: {parsed.data.last.utm_source ?? "Tagged link"}
        {parsed.data.last.utm_campaign
          ? ` · ${parsed.data.last.utm_campaign}`
          : ""}
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Saved with this application from consented, visitor-provided link
        parameters. Attribution is not independently verified by Meta.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["first", "last"] as const).map((kind) => (
          <section key={kind} className="min-w-0">
            <h4 className="mb-2 font-medium">
              {kind === "first"
                ? "First attributed visit"
                : "Latest attributed visit"}
            </h4>
            <dl className="space-y-2 break-words">
              {attributionFields.map((key) =>
                parsed.data[kind][key] ? (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">
                      {key.replaceAll("_", " ")}
                    </dt>
                    <dd>{parsed.data[kind][key]}</dd>
                  </div>
                ) : null,
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Landing page</dt>
                <dd>{parsed.data[kind].landingPath}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Captured at</dt>
                <dd>
                  {parsed.data[kind].capturedAt
                    .replace("T", " ")
                    .replace(".000Z", " UTC")}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </details>
  );
}
