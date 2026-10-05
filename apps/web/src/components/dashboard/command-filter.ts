/**
 * Client-side filter for the command palette's static entries (navigation and
 * actions). Every word of the query has to appear somewhere in the label, in
 * any order and any case, so "new job" finds "Create new job". An empty query
 * keeps everything.
 */
export function filterCommandItems<T extends { label: string }>(
  items: T[],
  query: string,
): T[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const label = item.label.toLocaleLowerCase();
    return words.every((word) => label.includes(word));
  });
}
