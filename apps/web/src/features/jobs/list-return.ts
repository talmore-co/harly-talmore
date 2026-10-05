const STORAGE_KEY = "harly:jobs-list-query";

/** Remember the jobs list's filter/sort query so the editor can return to it. */
export function rememberJobsListQuery(query: string) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, query);
  } catch {
    // Storage can be unavailable (private mode); returning unfiltered is fine.
  }
}

export function jobsListHref() {
  try {
    const query = window.sessionStorage.getItem(STORAGE_KEY);
    return query ? `/dashboard/jobs?${query}` : "/dashboard/jobs";
  } catch {
    return "/dashboard/jobs";
  }
}
