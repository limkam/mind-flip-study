import React from 'react';
import { cn } from '@/lib/utils';
import { QuizResultCardSkeleton } from './QuizResultCardSkeleton';

export function QuizHistoryListSkeleton({ rows = 5, className }) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <QuizResultCardSkeleton key={i} />
      ))}
    </div>
  );
}
