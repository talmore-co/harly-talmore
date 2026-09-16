"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { hasMarketingConsent } from "./MetaJobTracker";
import { captureAttribution, parseAttribution } from "./attribution";

function Tracker({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    const key = `harly:attribution:${workspaceId}`;
    let current = null as ReturnType<typeof parseAttribution>;
    const sync = () => {
      if (!hasMarketingConsent()) {
        current = null;
        try {
          for (const storedKey of Object.keys(localStorage)) {
            if (storedKey.startsWith("harly:attribution:"))
              localStorage.removeItem(storedKey);
          }
        } catch {
          /* Storage may be disabled. */
        }
        return;
      }
      let saved: unknown = current;
      try {
        saved = localStorage.getItem(key) ?? current;
      } catch {
        /* Use this page's memory. */
      }
      current = captureAttribution(
        new URL(window.location.href),
        workspaceId,
        saved,
      );
      try {
        if (current) localStorage.setItem(key, JSON.stringify(current));
        else localStorage.removeItem(key);
      } catch {
        /* Attribution never blocks an application. */
      }
    };
    const formData = (event: Event) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        !event.target.matches("[data-harly-application-form]")
      )
        return;
      sync();
      if (current && hasMarketingConsent())
        (event as FormDataEvent).formData.set(
          "applicationAttribution",
          JSON.stringify(current),
        );
    };
    sync();
    window.addEventListener("harly:consent-changed", sync);
    document.addEventListener("formdata", formData);
    return () => {
      window.removeEventListener("harly:consent-changed", sync);
      document.removeEventListener("formdata", formData);
    };
  }, [workspaceId, pathname, query]);
  return null;
}
export function ApplicationAttributionTracker(props: { workspaceId: string }) {
  return (
    <Suspense fallback={null}>
      <Tracker {...props} />
    </Suspense>
  );
}
