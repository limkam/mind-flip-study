import React from 'react';
import { motion } from 'framer-motion';

import { generationPhaseLabel } from '@/lib/generationPhases';

const STEPS = [
  { key: 'extracting_text', label: 'Extract' },
  { key: 'generating_chapter_breakdown', label: 'Chapters' },
  { key: 'saving_content', label: 'Saving' },
];

function stepIndex(phase) {
  const idx = STEPS.findIndex((s) => s.key === phase);
  if (idx >= 0) return idx;
  if (phase === 'completed') return STEPS.length;
  if (phase === 'starting' || phase === 'queued') return -1;
  if (
    phase === 'generating_summary' ||
    phase === 'generating_flashcards' ||
    phase === 'generating_scenarios' ||
    phase === 'generating_content'
  ) {
    return STEPS.findIndex((s) => s.key === 'generating_chapter_breakdown');
  }
  if (phase === 'retrying' || phase === 'refining_content') return 1;
  return 0;
}

/**
 * Progress strip for long-running flashcard generation jobs.
 */
export default function GenerateProgressBar({
  label,
  phase,
  chaptersTotal,
  chaptersDone,
  percentComplete,
  currentChapter,
}) {
  const activeIdx = stepIndex(phase);
  const displayLabel =
    label
    || (currentChapter ? `Summarizing: ${currentChapter}` : generationPhaseLabel(phase));
  const hasPercent = typeof percentComplete === 'number' && percentComplete >= 0;
  const progressWidth = hasPercent ? `${Math.min(100, percentComplete)}%` : '33%';

  return (
    <div className="w-full space-y-3 py-1">
      <p className="text-sm text-muted-foreground">{displayLabel}</p>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        {hasPercent ? (
          <motion.div
            className="absolute top-0 left-0 h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: progressWidth }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        ) : (
          <motion.div
            className="absolute top-0 h-full w-1/3 rounded-full bg-primary"
            initial={{ left: '-30%' }}
            animate={{ left: ['-30%', '100%'] }}
            transition={{ duration: 1.15, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>
      {chaptersTotal && chaptersDone != null ? (
        <p className="text-xs text-muted-foreground">
          Chapter {chaptersDone} of {chaptersTotal}
          {hasPercent ? ` · ${percentComplete}% complete` : ''}
        </p>
      ) : currentChapter ? (
        <p className="text-xs text-muted-foreground truncate">{currentChapter}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((step, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i || (activeIdx === -1 && i === 0);
          return (
            <span
              key={step.key}
              className={`text-xs px-2 py-1 rounded-full border ${
                done
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : active
                    ? 'bg-muted border-primary/40 text-foreground font-medium'
                    : 'bg-transparent border-border text-muted-foreground'
              }`}
            >
              {done ? '✓ ' : active ? '• ' : ''}
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
