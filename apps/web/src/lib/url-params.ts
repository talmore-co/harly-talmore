/**
 * Mirror client-side list state (filters, sort, view) into the URL without a
 * server round trip. Next syncs `history.replaceState` with `useSearchParams`,
 * so the state survives a reload, a shared link, and the browser back button.
 * `null` or an empty value removes the key.
 */
export function replaceUrlParams(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}
