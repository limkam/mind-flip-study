export function formatSummaryScope(selectedChapters: string[] = [], bookTitle = ""): string {
  const chapters = (selectedChapters || []).filter(Boolean);
  if (chapters.length === 0) {
    return bookTitle ? `Entire Book — ${bookTitle}` : "Entire Book";
  }
  if (chapters.length === 1) {
    return `Chapter — ${chapters[0]}`;
  }
  return `Chapters — ${chapters.join(", ")}`;
}

export const SUMMARY_DETAIL_OPTIONS = [
  { value: "brief", label: "Brief", description: "High-level overview, key concepts only" },
  { value: "standard", label: "Standard", description: "Balanced depth for regular study" },
  { value: "in_depth", label: "In-Depth", description: "Detailed explanations with examples" },
] as const;

export type SummaryDetailLevel = (typeof SUMMARY_DETAIL_OPTIONS)[number]["value"];

const ENHANCED_SUMMARY_SPECS: Record<
  SummaryDetailLevel,
  { overview: string; key_points: string; common_mistakes: string; core_concept: string }
> = {
  brief: {
    overview: "A concise 2–3 sentence overview — high-level only, key concepts, no examples",
    key_points: "3–4 concise, memorable bullet points — one line each",
    common_mistakes: "1–2 short notes on common misconceptions",
    core_concept: "A single sentence essential takeaway",
  },
  standard: {
    overview:
      "A clear 3–5 sentence overview explaining what the chapter covers, why it matters, and how concepts connect",
    key_points: "5–7 concise, memorable bullet points — each a complete standalone insight",
    common_mistakes: "2–3 short notes on common misconceptions or tricky areas",
    core_concept: "A single sentence that captures the most essential idea in plain language",
  },
  in_depth: {
    overview:
      "A detailed 5–8 sentence overview with concrete examples, connections between ideas, and exam-relevant framing",
    key_points: "7–8 detailed bullet points with examples and context — each substantive, not one-liners",
    common_mistakes: "3–4 pitfalls with brief explanations of why students get them wrong",
    core_concept: "1–2 sentences capturing the essential idea plus why it matters for exams",
  },
};

type ChapterPromptInput = { chapter: string; cardCount: number; qa: string };

export function buildEnhancedSummaryPrompt({
  bookTitle,
  chapterList,
  detailLevel = "standard",
}: {
  bookTitle: string;
  chapterList: ChapterPromptInput[];
  detailLevel?: SummaryDetailLevel;
}): string {
  const level = ENHANCED_SUMMARY_SPECS[detailLevel] ? detailLevel : "standard";
  const spec = ENHANCED_SUMMARY_SPECS[level];
  const detailLabel = SUMMARY_DETAIL_OPTIONS.find((o) => o.value === level)?.description ?? "";

  return `You are an expert educational content creator. Based on the flashcard Q&A pairs below from the book "${bookTitle}", generate rich chapter summaries.

Summary detail level: ${level.toUpperCase()} — ${detailLabel}
IMPORTANT: The length and depth of every section MUST clearly reflect this detail level. Brief must be noticeably shorter than Standard; In-Depth must be noticeably longer and more detailed.

${chapterList.map((c) => `=== CHAPTER: ${c.chapter} (${c.cardCount} cards) ===\n${c.qa}`).join("\n\n---\n\n")}

For EACH chapter, produce:
1. **overview**: ${spec.overview}
2. **key_points**: ${spec.key_points}
3. **core_concept**: ${spec.core_concept}
4. **common_mistakes**: ${spec.common_mistakes}
5. **difficulty**: Rate the chapter as "beginner", "intermediate", or "advanced"

Return structured JSON covering every chapter listed.`;
}
