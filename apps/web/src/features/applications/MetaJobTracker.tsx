"use client";
import { useEffect, useRef } from "react";

type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: Pixel;
  loaded: boolean;
  version: string;
};
declare global {
  interface Window {
    fbq?: Pixel;
    _fbq?: Pixel;
    harlyMetaPixels?: Set<string>;
    harlyMetaEvents?: Set<string>;
  }
}
export function hasMarketingConsent() {
  try {
    const cookie = document.cookie
      .split("; ")
      .find((value) => value.startsWith("harly_cookie_consent="));
    return Boolean(
      cookie &&
      JSON.parse(decodeURIComponent(cookie.split("=").slice(1).join("=")))
        .marketing === true,
    );
  } catch {
    return false;
  }
}
function initialize(pixelId: string) {
  if (!window.fbq) {
    const pixel: Pixel = Object.assign(
      (...args: unknown[]) => {
        if (pixel.callMethod) pixel.callMethod(...args);
        else pixel.queue.push(args);
      },
      { queue: [] as unknown[][], loaded: true, version: "2.0" },
    );
    pixel.push = pixel;
    window.fbq = pixel;
    window._fbq = pixel;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.append(script);
  }
  const initialized = (window.harlyMetaPixels ??= new Set());
  if (!initialized.has(pixelId)) {
    window.fbq("set", "autoConfig", false, pixelId);
    window.fbq("init", pixelId);
    initialized.add(pixelId);
  }
  window.fbq("consent", "grant");
}
export function MetaJobTracker({
  pixelId,
  jobId,
}: {
  pixelId: string;
  jobId: string;
}) {
  const view = useRef<{ jobId: string; pixelId: string; id: string } | null>(
    null,
  );
  useEffect(() => {
    if (view.current?.jobId !== jobId || view.current.pixelId !== pixelId)
      view.current = { jobId, pixelId, id: crypto.randomUUID() };
    const viewId = view.current.id;
    let started = false;
    const send = (name: string, eventId: string, custom = false) => {
      if (!hasMarketingConsent()) return;
      const sent = (window.harlyMetaEvents ??= new Set());
      const key = `${pixelId}:${name}:${eventId}`;
      if (sent.has(key)) return;
      initialize(pixelId);
      window.fbq!(
        custom ? "trackSingleCustom" : "trackSingle",
        pixelId,
        name,
        { content_ids: [jobId] },
        { eventID: eventId },
      );
      sent.add(key);
    };
    const consent = () => {
      if (hasMarketingConsent()) {
        initialize(pixelId);
        send("ViewContent", viewId);
      } else window.fbq?.("consent", "revoke");
    };
    const start = (event: Event) => {
      if (
        started ||
        !hasMarketingConsent() ||
        !(event.target instanceof Element) ||
        !event.target.closest("[data-harly-application-form]")
      )
        return;
      started = true;
      send("ApplicationStarted", `${viewId}:start`, true);
    };
    const submitted = (event: Event) => {
      const detail = (
        event as CustomEvent<{ eventId: string; qualified: boolean }>
      ).detail;
      if (!detail?.eventId) return;
      send("SubmitApplication", detail.eventId);
      if (detail.qualified)
        send("QualifiedApplication", `${detail.eventId}:qualified`, true);
    };
    consent();
    window.addEventListener("harly:consent-changed", consent);
    document.addEventListener("focusin", start);
    document.addEventListener("change", start);
    window.addEventListener("harly:application-submitted", submitted);
    return () => {
      window.fbq?.("consent", "revoke");
      window.removeEventListener("harly:consent-changed", consent);
      document.removeEventListener("focusin", start);
      document.removeEventListener("change", start);
      window.removeEventListener("harly:application-submitted", submitted);
    };
  }, [pixelId, jobId]);
  return <button type="button" className="mt-4 text-xs text-muted-foreground underline underline-offset-4" onClick={() => window.dispatchEvent(new Event("harly:open-cookie-preferences"))}>Cookie preferences</button>;
}
