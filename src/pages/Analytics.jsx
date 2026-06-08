import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '@/api/client';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Brain, Target, BookOpen } from 'lucide-react';
import { AnalyticsPageSkeleton } from '@/components/skeletons';

export default function Analytics() {
  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => {
      const { data } = await client.get('/analytics/me');
      return data;
    },
  });

  const scoreTrend = useMemo(() => {
    const rows = summary?.score_trend ?? [];
    return rows
      .map((d) => ({
        date: d.label,
        avg: d.avg_score,
        count: d.quiz_count,
      }))
      .filter((_, i) => i % 2 === 0);
  }, [summary]);

  const ratingCounts = useMemo(() => {
    const b = summary?.rating_breakdown ?? { easy: 0, medium: 0, hard: 0 };
    return [
      { name: 'Easy ✅', value: b.easy, color: '#10b981' },
      { name: 'Medium 🟡', value: b.medium, color: '#f59e0b' },
      { name: 'Hard 🔴', value: b.hard, color: '#ef4444' },
    ];
  }, [summary]);

  const weakTopics = useMemo(() => summary?.weak_topics ?? [], [summary]);

  if (isLoading) {
    return <AnalyticsPageSkeleton />;
  }

  if (isError) {
    return (
      <div className="max-w-5xl mx-auto text-center py-16">
        <p className="text-muted-foreground mb-4">Could not load analytics.</p>
        <button type="button" className="text-primary underline text-sm" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const quizCount = summary?.quiz_count ?? 0;
  const avgScore = summary?.avg_score ?? 0;
  const totalMastered = summary?.cards_mastered_easy_band ?? 0;
  const setsCount = summary?.flashcard_sets_count ?? 0;

  return (
    <div className="max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Progress Analytics</h1>
        <p className="text-muted-foreground mt-1">Track your learning over time</p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Quizzes Taken', value: quizCount, icon: Target, color: 'text-primary' },
          { label: 'Avg Score', value: `${avgScore}%`, icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'Cards Mastered', value: totalMastered, icon: Brain, color: 'text-accent' },
          { label: 'Sets Studied', value: setsCount, icon: BookOpen, color: 'text-blue-500' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-card rounded-2xl border border-border p-5"
          >
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-2xl font-heading font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <h2 className="font-heading text-lg font-semibold mb-4">Score Trend (30 days)</h2>
          {quizCount === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No quiz data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                  }}
                  formatter={(v) => (v !== null ? [`${v}%`, 'Avg Score'] : ['No data', ''])}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <h2 className="font-heading text-lg font-semibold mb-4">Cards by difficulty (SM-2)</h2>
          {(summary?.rating_breakdown?.easy ?? 0) +
            (summary?.rating_breakdown?.medium ?? 0) +
            (summary?.rating_breakdown?.hard ?? 0) ===
          0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Rate some cards to see data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ratingCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {ratingCounts.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl border border-border p-6"
      >
        <h2 className="font-heading text-lg font-semibold mb-4">Weak Topics (lowest avg scores)</h2>
        {weakTopics.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">
            Take some quizzes to see your weak areas
          </p>
        ) : (
          <div className="space-y-3">
            {weakTopics.map((t) => (
              <div key={t.set_id} className="flex items-center gap-3">
                <span className="text-sm font-medium w-48 truncate flex-shrink-0">{t.title}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                    style={{
                      width: `${t.avg_score}%`,
                      background:
                        t.avg_score >= 80 ? '#10b981' : t.avg_score >= 50 ? '#f59e0b' : '#ef4444',
                    }}
                  >
                    <span className="text-xs font-bold text-white">{t.avg_score}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
