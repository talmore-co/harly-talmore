import type { CandidateDirectoryFilters } from "./data";

/** Neutral filter value, mirrors `FILTER_ALL` in components/ui/FilterPill. */
const FILTER_ALL = "__all__";

/** Every search param the candidates directory understands. */
const DIRECTORY_PARAM_KEYS = [
  "q",
  "dept",
  "role",
  "stage",
  "status",
  "source",
  "tag",
  "sort",
  "page",
] as const;

/** Search param that carries the directory query string onto a profile. */
export const DIRECTORY_LIST_PARAM = "list";

/**
 * Next directory query string after changing one filter. Changing a filter
 * returns to the first page; changing the page keeps every filter.
 */
export function directoryQueryWithFilter(
  search: string,
  key: string,
  value: string,
) {
  const params = new URLSearchParams(search);
  const neutral =
    !value ||
    value === FILTER_ALL ||
    (key === "sort" && value === "recent") ||
    (key === "page" && value === "1");
  if (neutral) params.delete(key);
  else params.set(key, value);
  if (key !== "page") params.delete("page");
  return params.toString();
}

/** Keep only known directory params so a profile link cannot smuggle others. */
export function sanitizeDirectoryQuery(raw: string | null | undefined) {
  if (!raw) return "";
  const source = new URLSearchParams(raw.slice(0, 2000));
  const params = new URLSearchParams();
  for (const key of DIRECTORY_PARAM_KEYS) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** Directory filters encoded in a (sanitized) directory query string. */
export function directoryFiltersFromQuery(
  query: string,
): CandidateDirectoryFilters {
  const params = new URLSearchParams(query);
  const status = params.get("status");
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? undefined,
    department: params.get("dept") ?? undefined,
    role: params.get("role") ?? undefined,
    stage: params.get("stage") ?? undefined,
    status:
      status === "active" ||
      status === "hired" ||
      status === "rejected" ||
      status === "withdrawn"
        ? status
        : undefined,
    source: params.get("source") ?? undefined,
    tag: params.get("tag") ?? undefined,
    sort:
      sort === "oldest" || sort === "modified" || sort === "name"
        ? sort
        : "recent",
  };
}

export function directoryHref(listQuery: string) {
  return `/dashboard/candidates${listQuery ? `?${listQuery}` : ""}`;
}

/** Profile link that remembers which filtered list the user came from. */
export function candidateProfileHref(candidateId: string, listQuery: string) {
  const base = `/dashboard/candidates/${candidateId}`;
  if (!listQuery) return base;
  return `${base}?${new URLSearchParams({ [DIRECTORY_LIST_PARAM]: listQuery })}`;
}
