import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, BookOpen, Brain, CalendarDays, CheckCircle2,
  CircleAlert, Clock3, Lightbulb, Target, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function AnalyticsHeader({ range, onRangeChange }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <BarChart3 className="h-4 w-4" /> Learning dashboard
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Progress Analytics</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
          Track your learning patterns, retention, and quiz performance.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={onRangeChange}>
          <SelectTrigger className="w-[145px] bg-card" aria-label="Analytics date range">
            <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" asChild><Link to="/daily-review">Review cards</Link></Button>
        <Button size="sm" asChild><Link to="/flashcard-sets">Take a quiz <ArrowRight /></Link></Button>
      </div>
    </header>
  );
}

export function MetricCard({ icon: Icon, label, value, context, tone = 'primary', active = false }) {
  const tones = {
    primary: 'bg-primary/10 text-primary', success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    accent: 'bg-accent/10 text-accent', blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };
  return (
    <article className={cn('relative overflow-hidden rounded-2xl border bg-card p-4 sm:p-5', active && 'border-primary/30 bg-gradient-to-br from-card to-primary/[0.06]')}>
      {active && <span className="absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-primary/[0.05]" aria-hidden="true" />}
      <div className={cn('mb-5 flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-4 w-4" /></div>
      <p className="font-heading text-3xl font-bold tracking-tight">{value}</p>
      <h2 className="mt-1 text-sm font-semibold">{label}</h2>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground">{context}</p>
    </article>
  );
}

function topicStatus(score) {
  if (score >= 80) return { label: 'Strong', color: 'bg-emerald-500' };
  if (score >= 60) return { label: 'Improving', color: 'bg-amber-500' };
  return { label: 'Needs focus', color: 'bg-rose-500' };
}

export function WeakTopicsPanel({ topics }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6 lg:col-span-7" aria-labelledby="topics-title">
      <div><h2 id="topics-title" className="font-heading text-lg font-semibold">Topics to revisit</h2><p className="mt-1 text-xs text-muted-foreground">Ranked from lowest average quiz score</p></div>
      {topics.length === 0 ? (
        <div className="flex min-h-60 flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 flex gap-1.5" aria-hidden="true"><span className="mt-6 h-7 w-3 rounded-full bg-primary/25"/><span className="mt-3 h-10 w-3 rounded-full bg-primary/45"/><span className="h-13 w-3 rounded-full bg-primary" style={{height:52}}/></div>
          <h3 className="font-heading font-semibold">No weak topics detected yet</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Complete quizzes across your study sets to reveal the areas that need more attention.</p>
          <Button variant="outline" size="sm" className="mt-4" asChild><Link to="/flashcard-sets">Take a quiz</Link></Button>
        </div>
      ) : <div className="mt-5 space-y-5">{topics.map((topic) => { const status = topicStatus(topic.avg_score); return (
        <div key={topic.set_id}>
          <div className="mb-2 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{topic.title}</p><p className="text-xs text-muted-foreground">Average quiz score</p></div><span className="hidden rounded-full bg-muted px-2.5 py-1 text-xs font-medium sm:inline">{status.label}</span><strong className="w-12 text-right text-sm">{topic.avg_score}%</strong><Button variant="ghost" size="sm" asChild><Link to={`/study/${topic.set_id}`} aria-label={`Review ${topic.title}`}>Review</Link></Button></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', status.color)} style={{ width: `${Math.min(100, Math.max(0, topic.avg_score))}%` }} /></div>
        </div>); })}</div>}
    </section>
  );
}

export function StudyConsistency({ days, streak }) {
  const active = days.filter((day) => day.had_quiz).length;
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6 lg:col-span-5" aria-labelledby="consistency-title">
      <div className="flex items-start justify-between"><div><h2 id="consistency-title" className="font-heading text-lg font-semibold">Study Consistency</h2><p className="mt-1 text-xs text-muted-foreground">Quiz activity · last 14 days</p></div><div className="rounded-xl bg-amber-500/10 px-3 py-2 text-right"><strong className="block text-amber-600 dark:text-amber-400">{streak} day{streak === 1 ? '' : 's'}</strong><span className="text-[10px] text-muted-foreground">current streak</span></div></div>
      <div className="mt-7 grid grid-cols-7 gap-2" role="img" aria-label={`${active} active quiz days in the last 14 days.`}>{days.map((day) => <div key={day.day} className="text-center"><div className={cn('aspect-square rounded-md border', day.had_quiz ? 'border-primary bg-primary' : 'border-border bg-muted/50')} title={`${day.day}: ${day.had_quiz ? 'quiz completed' : 'no quiz'}`} /><span className="mt-1 block text-[9px] text-muted-foreground">{new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>)}</div>
      <div className="mt-5 flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm"><Clock3 className="h-4 w-4 text-primary" /><span>{active ? `${active} active quiz day${active === 1 ? '' : 's'} in this window` : 'Your first quiz day will light up this activity strip.'}</span></div>
    </section>
  );
}

export function InsightsPanel({ summary }) {
  const items = [];
  if ((summary.flashcard_sets_count ?? 0) > 0) items.push({ icon: BookOpen, text: `You have studied ${summary.flashcard_sets_count} set${summary.flashcard_sets_count === 1 ? '' : 's'}.` });
  if ((summary.quiz_count ?? 0) === 0) items.push({ icon: Target, text: 'Take a quiz to establish your performance baseline.' });
  if (((summary.rating_breakdown?.easy ?? 0) + (summary.rating_breakdown?.medium ?? 0) + (summary.rating_breakdown?.hard ?? 0)) === 0) items.push({ icon: Brain, text: 'Rate cards during review to unlock difficulty analytics.' });
  if ((summary.quiz_count ?? 0) > 0) items.push({ icon: CheckCircle2, text: `Your all-time quiz average is ${summary.avg_score ?? 0}%.` });
  if (!items.length) items.push({ icon: Lightbulb, text: 'Keep studying to build your next personalized insight.' });
  return <section className="rounded-2xl bg-foreground p-5 text-background sm:p-6" aria-labelledby="insights-title"><div className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-400"/><h2 id="insights-title" className="font-heading text-lg font-semibold">Insights</h2></div><div className="mt-5 grid gap-3 md:grid-cols-3">{items.slice(0,3).map(({icon: Icon,text}) => <div key={text} className="flex gap-3 rounded-xl bg-background/10 p-3 text-sm"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"/><span className="text-background/80">{text}</span></div>)}</div></section>;
}

export const metricIcons = { Target, TrendingUp, Brain, BookOpen, CircleAlert };
