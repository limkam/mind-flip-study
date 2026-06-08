import React from 'react';
import { cn } from '@/lib/utils';
import { PageHeaderSkeleton } from './PageHeaderSkeleton';
import { StatCardsGridSkeleton } from './StatCardsGridSkeleton';
import { ChartPanelsSkeleton } from './ChartPanelsSkeleton';
import { BlockPanelSkeleton } from './BlockPanelSkeleton';

export function AnalyticsPageSkeleton({ className }) {
  return (
    <div className={cn('max-w-5xl mx-auto space-y-6', className)}>
      <PageHeaderSkeleton />
      <StatCardsGridSkeleton count={4} />
      <ChartPanelsSkeleton />
      <BlockPanelSkeleton heightClass="h-48" />
    </div>
  );
}
