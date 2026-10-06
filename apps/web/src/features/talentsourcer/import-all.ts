export type ImportRow = { id: string; name: string; status: string; reason: string | null; candidateId: string | null };
type PageResult = { ok: true; batchId: string; rows: ImportRow[]; continueCursor: string; isDone: boolean } | { ok: false; error: string };
type SubmitResult = { ok: true; rows: ImportRow[] } | { ok: false; error: string };

export type ImportAllProgress = {
  pages: number;
  imported: number;
  /** Already in this job's pipeline: matched and left unchanged. */
  existing: number;
  /** Rows that were not imported and need someone to look at them. */
  attention: ImportRow[];
};
export type ImportAllResult = ImportAllProgress & { done: boolean; error?: string };

/**
 * Walks every source page with the same preview and submit actions a recruiter
 * uses by hand, importing each page's ready rows before loading the next one.
 * Stops after the current page when shouldStop returns true.
 */
export async function importAllPages({ loadPage, submit, onProgress, shouldStop }: {
  loadPage: (cursor?: string) => Promise<PageResult>;
  submit: (batchId: string, itemIds: string[]) => Promise<SubmitResult>;
  onProgress: (progress: ImportAllProgress) => void;
  shouldStop: () => boolean;
}): Promise<ImportAllResult> {
  const progress: ImportAllProgress = { pages: 0, imported: 0, existing: 0, attention: [] };
  let cursor: string | undefined;
  while (true) {
    const page = await loadPage(cursor);
    if (!page.ok) return { ...progress, done: false, error: page.error };
    let rows = page.rows;
    const ready = rows.filter(row => row.status === "ready").map(row => row.id);
    if (ready.length) {
      const result = await submit(page.batchId, ready);
      if (!result.ok) return { ...progress, done: false, error: result.error };
      rows = result.rows;
    }
    progress.pages += 1;
    for (const row of rows) {
      if (row.status === "imported") progress.imported += 1;
      // Matched candidates carry an ID; access and validation skips do not.
      else if (row.status === "skipped" && row.candidateId) progress.existing += 1;
      else progress.attention.push(row);
    }
    onProgress({ ...progress, attention: [...progress.attention] });
    if (page.isDone) return { ...progress, done: true };
    if (!page.continueCursor || page.continueCursor === cursor) return { ...progress, done: false, error: "TalentSourcer stopped returning further pages. Run Import all again to continue." };
    if (shouldStop()) return { ...progress, done: false };
    cursor = page.continueCursor;
  }
}
