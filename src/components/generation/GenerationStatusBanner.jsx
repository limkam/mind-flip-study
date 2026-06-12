import React from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GenerateProgressBar from '@/components/dashboard/GenerateProgressBar';
import { generationPhaseLabel } from '@/lib/generationPhases';
import { useGenerationJobs } from '@/lib/GenerationJobContext';

export default function GenerationStatusBanner() {
  const { jobs, removeJob } = useGenerationJobs();
  const active = jobs[0];

  if (!active) return null;

  const chapterLine =
    active.chaptersTotal && active.chaptersDone != null
      ? `Chapter ${active.chaptersDone} of ${active.chaptersTotal}`
      : null;

  return (
    <div
      className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-8 lg:w-[420px] z-50 rounded-2xl border border-primary/20 bg-card shadow-xl p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Generating flashcards…</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {active.bookTitle || 'Your study set'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This may take a few moments. You may continue using MindFlip while generation completes.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          aria-label="Dismiss banner"
          onClick={() => removeJob(active.jobId)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <GenerateProgressBar
        phase={active.phase}
        label={generationPhaseLabel(active.phase)}
        chaptersTotal={active.chaptersTotal}
        chaptersDone={active.chaptersDone}
        percentComplete={active.percentComplete}
        currentChapter={active.currentChapter}
      />

      {(chapterLine || active.percentComplete != null) ? (
        <div className="flex items-center justify-between text-xs font-medium mt-2">
          {chapterLine ? <span className="text-muted-foreground">{chapterLine}</span> : <span />}
          {active.percentComplete != null ? (
            <span className="text-primary">{active.percentComplete}% complete</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Working…
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
