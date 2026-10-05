/**
 * Bulk actions only ever apply to rows the user can see. A selection made
 * before narrowing the search or source filter keeps its hidden ids, so the
 * raw set must be intersected with the visible rows before it is acted on or
 * counted. Returned in visible order.
 */
export function visibleSelection(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
): string[] {
  return visibleIds.filter((id) => selectedIds.has(id));
}

/** Header checkbox state: every visible row is selected (and there is one). */
export function allVisibleSelected(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
}

/**
 * Header checkbox toggle: clear the visible rows when they are all selected,
 * otherwise select them all. Hidden rows keep whatever state they had.
 */
export function toggleVisibleSelection(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const next = new Set(selectedIds);
  if (allVisibleSelected(selectedIds, visibleIds)) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}
