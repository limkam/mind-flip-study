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
