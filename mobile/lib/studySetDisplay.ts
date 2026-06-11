export type StudySetDisplayInput = {
  title?: string;
  book_title?: string | null;
  selected_chapters?: string[] | null;
};

export function parseStudySetDisplay(flashcardSet?: StudySetDisplayInput | null) {
  if (!flashcardSet) {
    return { title: "", chapters: [] as string[], chapterCount: 0 };
  }

  const chapters = Array.isArray(flashcardSet.selected_chapters)
    ? flashcardSet.selected_chapters.filter(Boolean)
    : [];

  const rawTitle = flashcardSet.title || "";
  const bookTitle = flashcardSet.book_title || "";

  let title = bookTitle || rawTitle;
  if (rawTitle.includes(" — ")) {
    const [before] = rawTitle.split(" — ");
    if (before?.trim()) {
      title = bookTitle || before.trim();
    }
  }

  return {
    title,
    chapters,
    chapterCount: chapters.length,
  };
}

export function chapterSelectionSubtitle(chapterCount: number) {
  if (chapterCount === 0) return null;
  if (chapterCount === 1) return "Generating flashcards for 1 chapter";
  return `Generating flashcards for ${chapterCount} chapters`;
}
