import React from 'react';
import { Brain } from 'lucide-react';
import SelectedChaptersList from '@/components/study/SelectedChaptersList';
import { chapterSelectionSubtitle, parseStudySetDisplay } from '@/lib/studySetDisplay';

export default function StudySetHeader({
  flashcardSet,
  cardCount = 0,
  ratedCount = 0,
  easyCount = 0,
  hardCount = 0,
  offlineHint = false,
}) {
  const { title, chapters, chapterCount } = parseStudySetDisplay(flashcardSet);
  const subtitle = chapterSelectionSubtitle(chapterCount);

  return (
    <div className="mb-8">
      <h1 className="font-heading text-2xl lg:text-3xl font-bold break-words">{title}</h1>
      {subtitle ? (
        <p className="text-sm font-medium text-primary mt-1">{subtitle}</p>
      ) : null}
      <p className="text-muted-foreground mt-1">
        {cardCount} cards{flashcardSet?.book_title && chapterCount === 0 ? ` • ${flashcardSet.book_title}` : ''}
      </p>
      {chapters.length > 0 ? (
        <SelectedChaptersList chapters={chapters} className="mt-4" />
      ) : null}
      {offlineHint ? (
        <p className="text-xs text-amber-600 mt-2">
          Offline — progress saved locally and will sync when you reconnect.
        </p>
      ) : null}
      {ratedCount > 0 ? (
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Brain className="w-3.5 h-3.5" /> {ratedCount}/{cardCount} rated
          </span>
          {easyCount > 0 ? (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {easyCount} easy
            </span>
          ) : null}
          {hardCount > 0 ? (
            <span className="text-xs font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
              {hardCount} hard
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
