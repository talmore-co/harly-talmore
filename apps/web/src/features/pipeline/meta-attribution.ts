import { attributionSchema, type ApplicationAttribution } from "@/features/applications/attribution";

type Touch = ApplicationAttribution["first"];
const metaSources = new Set(["fb", "ig", "facebook", "instagram", "meta", "an", "audience_network", "messenger", "msg", "threads", "th"]);
const paidMedia = new Set(["paid_social", "paid-social", "paid", "cpc", "ppc", "paidsocial"]);

export function isMetaAdTouch(touch: Touch): boolean {
  return metaSources.has(touch.utm_source?.toLowerCase() ?? "") &&
    (paidMedia.has(touch.utm_medium?.toLowerCase() ?? "") || Boolean(touch.ad_id));
}

export function metaAdAttribution(value: unknown): ApplicationAttribution | null {
  // Saved application snapshots do not expire with the browser's attribution cookie.
  const parsed = attributionSchema.safeParse(value);
  if (!parsed.success) return null;
  return isMetaAdTouch(parsed.data.first) || isMetaAdTouch(parsed.data.last)
    ? parsed.data
    : null;
}
