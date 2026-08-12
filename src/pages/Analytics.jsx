import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '@/api/client';
import { Button } from '@/components/ui/button';
import { AnalyticsPageSkeleton } from '@/components/skeletons';
import {
  AnalyticsHeader, InsightsPanel, MetricCard, StudyConsistency, WeakTopicsPanel, metricIcons,
} from '@/components/analytics/AnalyticsDashboard';

const AnalyticsCharts = React.lazy(() => import('@/components/analytics/AnalyticsCharts'));

const RANGE_LABELS = { '7': 'last 7 days', '30': 'last 30 days', '90': 'last 90 days', all: 'all available history' };

export default function Analytics() {
  const [range, setRange] = useState('30');
  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => (await client.get('/analytics/me')).data,
  });

  const trend = useMemo(() => {
    const rows = Array.isArray(summary?.score_trend) ? summary.score_trend : [];
    const limit = range === '7' ? 7 : rows.length;
    return rows.slice(-limit).map((row) => ({ date: row.label ?? row.day, avg: row.avg_score, count: row.quiz_count ?? 0 }));
  }, [range, summary]);

  const difficulty = useMemo(() => {
    const ratings = summary?.rating_breakdown ?? {};
    const rated = (Number(ratings.easy) || 0) + (Number(ratings.medium) || 0) + (Number(ratings.hard) || 0);
    const unrated = Math.max(0, (Number(summary?.flashcards_created) || 0) - rated);
    return [
      { name: 'Easy', value: Number(ratings.easy) || 0, color: 'hsl(var(--chart-3))' },
      { name: 'Good', value: Number(ratings.medium) || 0, color: 'hsl(var(--chart-4))' },
      { name: 'Needs review', value: Number(ratings.hard) || 0, color: 'hsl(var(--chart-2))' },
      { name: 'Unrated', value: unrated, color: 'hsl(var(--muted-foreground))' },
    ];
  }, [summary]);

  if (isLoading) return <AnalyticsPageSkeleton className="max-w-7xl" />;
  if (isError) return <div className="mx-auto max-w-xl rounded-2xl border bg-card p-10 text-center"><metricIcons.CircleAlert className="mx-auto mb-3 h-8 w-8 text-destructive"/><h1 className="font-heading text-xl font-semibold">Analytics could not be loaded</h1><p className="mt-2 text-sm text-muted-foreground">Your data is safe. Check your connection and try again.</p><Button className="mt-5" onClick={() => refetch()}>Try again</Button></div>;

  const safe = summary ?? {};
  const quizzes = Number(safe.quiz_count) || 0;
  const score = Number(safe.avg_score) || 0;
  const mastered = Number(safe.cards_mastered_easy_band) || 0;
  const sets = Number(safe.flashcard_sets_count) || 0;
  const difficultyTotal = difficulty.reduce((total, item) => total + item.value, 0);
  const hasTrend = trend.some((point) => point.avg !== null && point.avg !== undefined);

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-8">
      <AnalyticsHeader range={range} onRangeChange={setRange} />
      {(range === '90' || range === 'all') && <p className="-mt-3 text-xs text-muted-foreground">Detailed score points are currently available for the most recent 30 days; summary metrics remain all-time.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard icon={metricIcons.Target} label="Quizzes Taken" value={quizzes} context={quizzes ? `${quizzes} result${quizzes === 1 ? '' : 's'} recorded` : 'Complete your first quiz'} />
        <MetricCard icon={metricIcons.TrendingUp} label="Average Score" value={`${score}%`} context={quizzes ? 'Across all completed quizzes' : 'No score history yet'} tone="success" />
        <MetricCard icon={metricIcons.Brain} label="Cards Mastered" value={mastered} context={mastered ? 'In your easy retention band' : 'Start rating cards'} tone="accent" />
        <MetricCard icon={metricIcons.BookOpen} label="Sets Studied" value={sets} context={sets ? `${sets} active study set${sets === 1 ? '' : 's'}` : 'Create your first study set'} tone="blue" active={sets > 0} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <React.Suspense fallback={<><div className="h-[390px] animate-pulse rounded-2xl bg-muted lg:col-span-8" /><div className="h-[390px] animate-pulse rounded-2xl bg-muted lg:col-span-4" /></>}>
          <AnalyticsCharts trend={trend} hasTrend={hasTrend} rangeLabel={RANGE_LABELS[range]} difficulty={difficulty} difficultyTotal={difficultyTotal} />
        </React.Suspense>
        <WeakTopicsPanel topics={Array.isArray(safe.weak_topics) ? safe.weak_topics : []} />
        <StudyConsistency days={Array.isArray(safe.last_14_days) ? safe.last_14_days : []} streak={Number(safe.streak_days) || 0} />
      </div>
      <InsightsPanel summary={safe} />
    </main>
  );
}
