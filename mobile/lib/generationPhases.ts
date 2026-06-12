export const GENERATION_PHASE_LABELS: Record<string, string> = {
  queued: "Generation started…",
  starting: "Generation started…",
  extracting_text: "Extracting text from PDF…",
  generating_summary: "Generating summary…",
  generating_flashcards: "Generating flashcards…",
  generating_scenarios: "Generating scenarios…",
  generating_chapter_breakdown: "Generating flashcards…",
  refining_content: "Refining flashcards…",
  repairing_content: "Repairing content after QA…",
  generating_content: "Generating study content…",
  saving_content: "Saving content…",
  retrying: "Retrying after a temporary error…",
  completed: "Completed",
  failed: "Generation failed",
};

export function generationPhaseLabel(phase?: string | null): string {
  if (!phase) return "Generating study content…";
  return GENERATION_PHASE_LABELS[phase] || "Generating study content…";
}

export function extractSetIdFromJob(data: { result?: unknown }): string | null {
  const result = data?.result;
  if (result && typeof result === "object" && "set_id" in result) {
    return String((result as { set_id: string }).set_id);
  }
  return null;
}

export function extractJobError(data: { result?: unknown }): string | null {
  const result = data?.result;
  if (result && typeof result === "object" && "error" in result) {
    return String((result as { error: unknown }).error);
  }
  return null;
}
