import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** One quiz-history row card placeholder. */
export function QuizResultCardSkeleton({ className }) {
  return (
    <div className={cn('bg-card rounded-2xl border border-border p-6 space-y-3', className)}>
      <Skeleton className="h-5 w-1/3 max-w-[200px]" />
      <Skeleton className="h-4 w-1/4 max-w-[120px]" />
    </div>
  );
}
