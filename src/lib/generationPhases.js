export const GENERATION_PHASE_LABELS = {
  queued: "Generation started…",
  starting: "Generation started…",
  extracting_text: "Extracting text from PDF…",
  generating_summary: "Generating summary…",
  generating_flashcards: "Generating flashcards…",
  generating_scenarios: "Generating scenarios…",
  generating_content: "Generating study content…",
  saving_content: "Saving content…",
  retrying: "Retrying after a temporary error…",
  completed: "Completed",
  failed: "Generation failed",
};

export function generationPhaseLabel(phase) {
  if (!phase) return "Generating study content…";
  return GENERATION_PHASE_LABELS[phase] || "Generating study content…";
}

export function extractSetIdFromJob(data) {
  const result = data?.result;
  if (result && typeof result === "object" && result.set_id) {
    return String(result.set_id);
  }
  return null;
}

export function extractJobError(data) {
  const result = data?.result;
  if (result && typeof result === "object" && result.error != null) {
    return String(result.error);
  }
  return null;
}
