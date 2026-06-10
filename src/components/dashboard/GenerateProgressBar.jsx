import React from 'react';
import { motion } from 'framer-motion';

import { generationPhaseLabel } from '@/lib/generationPhases';

const STEPS = [
  { key: 'generating_summary', label: 'Summary' },
  { key: 'generating_flashcards', label: 'Flashcards' },
  { key: 'generating_scenarios', label: 'Scenarios' },
  { key: 'saving_content', label: 'Saving' },
];

function stepIndex(phase) {
  const idx = STEPS.findIndex((s) => s.key === phase);
  if (idx >= 0) return idx;
  if (phase === 'completed') return STEPS.length;
  if (phase === 'extracting_text' || phase === 'starting' || phase === 'queued') return -1;
  if (phase === 'retrying') return 0;
  return 0;
}

/**
 * Indeterminate progress strip for long-running jobs (e.g. flashcard generation).
 */
export default function GenerateProgressBar({ label, phase }) {
  const activeIdx = stepIndex(phase);
  const displayLabel = label || generationPhaseLabel(phase);

  return (
    <div className="w-full space-y-3 py-1">
      <p className="text-sm text-muted-foreground">{displayLabel}</p>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute top-0 h-full w-1/3 rounded-full bg-primary"
          initial={{ left: '-30%' }}
          animate={{ left: ['-30%', '100%'] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'linear' }}
        />
      </div>
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
