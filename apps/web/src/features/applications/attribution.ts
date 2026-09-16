import { z } from "zod";

export const attributionFields = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "adset_id",
  "ad_id",
] as const;
const label = z.string().trim().min(1).max(200);
const touchSchema = z
  .object({
    capturedAt: z.string().datetime(),
    landingPath: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)[^?#]*$/),
    utm_source: label.optional(),
    utm_medium: label.optional(),
    utm_campaign: label.optional(),
    utm_content: label.optional(),
    utm_term: label.optional(),
    campaign_id: label.optional(),
    adset_id: label.optional(),
    ad_id: label.optional(),
  })
  .refine((value) => attributionFields.some((key) => value[key]));
export const attributionSchema = z.object({
  version: z.literal(1),
  workspaceId: z.string().max(100),
  first: touchSchema,
  last: touchSchema,
});
export type ApplicationAttribution = z.infer<typeof attributionSchema>;
export const ATTRIBUTION_MAX_AGE = 30 * 86400_000;

export function parseAttribution(
  value: unknown,
  now = Date.now(),
): ApplicationAttribution | null {
  try {
    if (typeof value === "string" && value.length > 12000) return null;
    const parsed = attributionSchema.safeParse(
      typeof value === "string" ? JSON.parse(value) : value,
    );
    if (!parsed.success) return null;
    const first = Date.parse(parsed.data.first.capturedAt),
      last = Date.parse(parsed.data.last.capturedAt);
    if (
      first > last ||
      last > now + 60_000 ||
      now - first > ATTRIBUTION_MAX_AGE
    )
      return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function captureAttribution(
  url: URL,
  workspaceId: string,
  previous: unknown,
  now = Date.now(),
): ApplicationAttribution | null {
  const saved = parseAttribution(previous, now);
  const existing = saved?.workspaceId === workspaceId ? saved : null;
  const fields: Partial<Record<(typeof attributionFields)[number], string>> =
    {};
  for (const key of attributionFields) {
    const value = url.searchParams.get(key)?.trim();
    if (value && value.length <= 200) fields[key] = value;
  }
  if (!Object.keys(fields).length) return existing;
  const touch = {
    ...fields,
    landingPath: url.pathname.slice(0, 500),
    capturedAt: new Date(now).toISOString(),
  };
  // Revisiting or refreshing the same tagged URL does not invent a new touch.
  if (
    existing &&
    existing.last.landingPath === touch.landingPath &&
    attributionFields.every((key) => existing.last[key] === touch[key])
  )
    return existing;
  return parseAttribution(
    {
      version: 1,
      workspaceId,
      first: existing?.first ?? touch,
      last: touch,
    },
    now,
  );
}
