import React from 'react';
import { motion } from 'framer-motion';

/**
 * Indeterminate progress strip for long-running jobs (e.g. flashcard generation).
 */
export default function GenerateProgressBar({ label = 'Working…' }) {
  return (
    <div className="w-full space-y-2 py-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute top-0 h-full w-1/3 rounded-full bg-primary"
          initial={{ left: '-30%' }}
          animate={{ left: ['-30%', '100%'] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    </div>
  );
}
