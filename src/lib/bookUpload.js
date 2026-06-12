import client from "@/api/client";

/**
 * Detect title and author from a local PDF file before upload.
 */
export async function detectPdfMetadata(file) {
  const form = new FormData();
  form.append("file", file, file.name || "upload.pdf");
  // Do NOT set Content-Type — browser must add multipart boundary automatically
  const { data } = await client.post("/books/detect-metadata", form);
  return data;
}

export const TOC_PHASE_LABELS = {
  extracting_contents: "Extracting contents…",
  analyzing_structure: "Analyzing document structure…",
  extracting_toc: "Analyzing document structure…",
  queued: "Starting TOC extraction…",
};

export function tocPhaseLabel(phase) {
  return TOC_PHASE_LABELS[phase] || "Processing…";
}
