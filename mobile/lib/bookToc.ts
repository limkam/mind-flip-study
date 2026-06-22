import type { BookOut } from "../types/api";

const IN_PROGRESS_TOC_PHASES = new Set([
  "extracting_contents",
  "analyzing_structure",
  "extracting_toc",
]);

export function getTocJobIdFromBook(book?: BookOut | null): string | null {
  if (!book) return null;
  return book.toc_job_id || (book.extras?.processing?.job_id as string | undefined) || null;
}

export function getTocErrorFromBook(book?: BookOut | null): string | null {
  if (!book) return null;
  if (book.toc_error) return book.toc_error;
  if (book.processing_phase === "error") {
    return (book.extras?.processing?.error as string | undefined) || "TOC extraction failed";
  }
  return null;
}

export function isTocExtractionInProgress(book?: BookOut | null): boolean {
  if (!book) return false;
  const phase = book.processing_phase || (book.extras?.processing?.phase as string | undefined) || "";
  return IN_PROGRESS_TOC_PHASES.has(phase);
}
