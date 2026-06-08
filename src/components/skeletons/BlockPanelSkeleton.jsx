import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function BlockPanelSkeleton({ className, heightClass = 'h-48' }) {
  return <Skeleton className={cn('rounded-2xl', heightClass, className)} />;
}
