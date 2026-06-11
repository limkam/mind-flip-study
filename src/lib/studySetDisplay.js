/** Parse flashcard set title and chapters for clean UI display. */

export function parseStudySetDisplay(flashcardSet) {
  if (!flashcardSet) {
    return { title: '', chapters: [], chapterCount: 0 };
  }

  const chapters = Array.isArray(flashcardSet.selected_chapters)
    ? flashcardSet.selected_chapters.filter(Boolean)
    : [];

  const rawTitle = flashcardSet.title || '';
  const bookTitle = flashcardSet.book_title || '';

  let title = bookTitle || rawTitle;
  if (rawTitle.includes(' — ')) {
    const [before] = rawTitle.split(' — ');
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

export function buildFlashcardSetTitle(bookTitle, selectedChapters = []) {
  return bookTitle?.trim() || 'Study set';
}

export function chapterSelectionSubtitle(chapterCount) {
  if (chapterCount === 0) return null;
  if (chapterCount === 1) return 'Generating flashcards for 1 chapter';
  return `Generating flashcards for ${chapterCount} chapters`;
}
