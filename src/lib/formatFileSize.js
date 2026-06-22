/** Format bytes as human-readable file size. */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

/** Estimate PDF page count from file size (rough heuristic when not parsed). */
export function estimatePageCount(bytes) {
  if (!bytes) return null;
  // ~50KB per page average for text-heavy PDFs
  return Math.max(1, Math.round(bytes / 50_000));
}
