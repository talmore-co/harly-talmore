"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";

export function applySelectionRange(
  current: Set<string>,
  orderedIds: string[],
  id: string,
  anchor: string | null,
  shift: boolean,
  checked = !current.has(id),
) {
  const end = orderedIds.indexOf(id);
  if (end < 0) return current;
  const start = shift && anchor ? orderedIds.indexOf(anchor) : -1;
  const targets =
    start < 0
      ? [id]
      : orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
  const next = new Set(current);
  for (const target of targets) {
    if (checked) next.add(target);
    else next.delete(target);
  }
  return next;
}

/** Ranges only cross rows in the current visible order, never hidden pages/filters. */
export function useRangeSelection(
  orderedIds: string[],
  setSelected: Dispatch<SetStateAction<Set<string>>>,
) {
  const anchor = useRef<{ id: string; order: string } | null>(null);
  const order = JSON.stringify(orderedIds);
  return (id: string, shift = false, checked?: boolean) => {
    const from = anchor.current?.order === order ? anchor.current.id : null;
    if (!shift || !from) anchor.current = { id, order };
    setSelected((current) =>
      applySelectionRange(
        current,
        orderedIds,
        id,
        current.size ? from : null,
        shift,
        checked,
      ),
    );
  };
}
