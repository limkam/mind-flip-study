import React from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Brain, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

function EmptyChart() {
  return (
    <div className="relative flex h-[280px] items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/20 px-6 text-center">
      <svg className="absolute inset-x-5 bottom-6 h-28 w-[calc(100%-2.5rem)] opacity-25" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 95 C70 88 105 98 160 75 S260 92 315 58 S410 76 465 42 S545 55 600 25" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeDasharray="7 8" />
        <path d="M0 110H600" stroke="hsl(var(--border))" strokeDasharray="4 6" />
      </svg>
      <div className="relative z-10 -mt-10 max-w-sm">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border bg-card text-primary shadow-sm"><TrendingUp /></div>
        <h3 className="font-heading font-semibold">Your score trend will appear here</h3>
        <p className="mt-1 text-sm text-muted-foreground">Quiz results create a clear performance baseline over time.</p>
        <Button className="mt-4" size="sm" asChild><Link to="/flashcard-sets">Take your first quiz</Link></Button>
      </div>
    </div>
  );
}

function LearningMomentumChart({ data, hasData, rangeLabel }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6 lg:col-span-8" aria-labelledby="momentum-title">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><h2 id="momentum-title" className="font-heading text-lg font-semibold">Learning Momentum</h2><p className="mt-1 text-xs text-muted-foreground">Average quiz score · {rangeLabel}</p></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> Quiz score</div>
      </div>
      {!hasData ? <EmptyChart /> : (
        <div role="img" aria-label={`Quiz score trend for ${rangeLabel}.`}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
              <defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 5" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10 }} formatter={(v, _, item) => [`${v}% (${item.payload.count} quiz${item.payload.count === 1 ? "" : "zes"})`, "Average score"]} />
              <Area type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#scoreFill)" connectNulls dot={{ r: 3, fill: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function DifficultyDistribution({ data, total }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6 lg:col-span-4" aria-labelledby="difficulty-title">
      <h2 id="difficulty-title" className="font-heading text-lg font-semibold">Card Difficulty</h2>
      <p className="mt-1 text-xs text-muted-foreground">SM-2 retention bands</p>
      {total === 0 ? (
        <div className="flex min-h-[285px] flex-col items-center justify-center text-center">
          <div className="relative mb-4 flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-muted"><Brain className="text-muted-foreground" /><span className="absolute -right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span></div>
          <h3 className="font-heading font-semibold">No card ratings yet</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Ratings improve scheduling and unlock retention insights.</p>
          <Button variant="outline" size="sm" className="mt-4" asChild><Link to="/daily-review">Review and rate cards</Link></Button>
        </div>
      ) : (
        <div>
          <div className="relative mx-auto h-48 max-w-[240px]" role="img" aria-label={`Difficulty distribution across ${total} cards, including unrated cards.`}>
            <ResponsiveContainer><PieChart><Pie data={data} dataKey="value" innerRadius={58} outerRadius={78} paddingAngle={3}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => [`${value} cards`, "Count"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10 }} /></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="font-heading text-2xl">{total}</strong><span className="text-xs text-muted-foreground">total cards</span></div>
          </div>
          <div className="space-y-2">{data.map((item) => <div key={item.name} className="flex items-center text-sm"><span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span>{item.name}</span><span className="ml-auto font-medium">{item.value} <span className="text-muted-foreground">· {Math.round(item.value / total * 100)}%</span></span></div>)}</div>
        </div>
      )}
    </section>
  );
}

export default function AnalyticsCharts({ trend, hasTrend, rangeLabel, difficulty, difficultyTotal }) {
  return (
    <>
      <LearningMomentumChart data={trend} hasData={hasTrend} rangeLabel={rangeLabel} />
      <DifficultyDistribution data={difficulty} total={difficultyTotal} />
    </>
  );
}
