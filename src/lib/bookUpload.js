/**
 * Derive book title from uploaded file name (no PDF parsing).
 */
export function titleFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const base = filename.replace(/\\/g, '/').split('/').pop() || '';
  const stem = base.replace(/\.pdf$/i, '').trim();
  if (!stem) return '';
  return stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export const TOC_PHASE_LABELS = {
  extracting_contents: 'Extracting contents…',
  analyzing_structure: 'Analyzing document structure…',
  extracting_toc: 'Analyzing document structure…',
  queued: 'Starting TOC extraction…',
};

export function tocPhaseLabel(phase) {
  return TOC_PHASE_LABELS[phase] || 'Processing…';
}

export function getTocJobIdFromBook(book) {
  if (!book) return null;
  return book.toc_job_id || book.extras?.processing?.job_id || null;
}

export function getTocErrorFromBook(book) {
  if (!book) return null;
  if (book.toc_error) return book.toc_error;
  if (book.processing_phase === 'error') {
    return book.extras?.processing?.error || 'TOC extraction failed';
  }
  return null;
}

const IN_PROGRESS_TOC_PHASES = new Set([
  'extracting_contents',
  'analyzing_structure',
  'extracting_toc',
]);

/** True while the server is still extracting the table of contents. */
export function isTocExtractionInProgress(book) {
  if (!book) return false;
  const phase = book.processing_phase || book.extras?.processing?.phase || '';
  return IN_PROGRESS_TOC_PHASES.has(phase);
}
