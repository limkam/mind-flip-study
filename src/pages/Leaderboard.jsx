import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal, Users, Globe, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Pagination from "@/components/pagination/Pagination";
import { LeaderboardListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

const PERIODS = [
  { id: "weekly", label: "Weekly", description: "This week's XP (Mon 00:00 – Sun 23:59 UTC)" },
  { id: "all_time", label: "All Time", description: "Cumulative lifetime XP" },
];

const SCOPES = [
  { id: "global", label: "Global", icon: Globe },
  { id: "connections", label: "Friends & Groups", icon: Users },
];

const SECONDARY_METRICS = [
  { id: "xp", label: "XP (Default)", unit: "XP", format: (v) => `${Math.round(v).toLocaleString()} XP` },
  { id: "avg_score", label: "Avg Score", unit: "%", format: (v) => `${v}%` },
  { id: "most_quizzes", label: "Quizzes", unit: "quizzes", format: (v) => String(Math.round(v)) },
  { id: "cards_mastered", label: "Cards Mastered", unit: "cards", format: (v) => String(Math.round(v)) },
];

function RankBadge({ rank }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-6 text-center">#{rank}</span>;
}

function LeaderRow({ rank, fullName, avatarUrl, value, formatValue, unit, isMe }) {
  const displayName = fullName && fullName !== "Anonymous" ? fullName : "Learner";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 p-3.5 rounded-xl transition-all ${
        isMe
          ? "bg-primary/10 border-2 border-primary/40 shadow-sm"
          : rank <= 3
          ? "bg-gradient-to-r from-primary/5 via-accent/5 to-transparent border border-primary/10"
          : "bg-card border border-border/60 hover:border-border"
      }`}
    >
      <div className="w-8 flex items-center justify-center flex-shrink-0">
        <RankBadge rank={rank} />
      </div>
      <Avatar className="w-9 h-9 flex-shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
        <AvatarFallback
          className={`text-xs font-semibold ${
            rank === 1 ? "bg-yellow-400/20 text-yellow-600" : isMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate flex items-center gap-1.5">
          <span>{displayName}</span>
          {isMe && (
            <span className="text-[10px] uppercase tracking-wider font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded">
              YOU
            </span>
          )}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-heading font-bold text-sm text-foreground">{formatValue(value)}</p>
      </div>
    </motion.div>
  );
}

export default function Leaderboard() {
  const { user: me } = useAuth();
  const [period, setPeriod] = useState("weekly");
  const [scope, setScope] = useState("global");
  const [metric, setMetric] = useState("xp");
  const [page, setPage] = useState(1);
  const [showSecondaryMetrics, setShowSecondaryMetrics] = useState(false);

  const activeMetricObj = SECONDARY_METRICS.find((m) => m.id === metric) || SECONDARY_METRICS[0];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leaderboard-v2", scope, period, metric, page, PAGE_SIZE],
    queryFn: async () => {
      const { data: body } = await client.get("/leaderboard", {
        params: { scope, period, metric, page, size: PAGE_SIZE },
      });
      return body;
    },
    enabled: !!me,
  });

  const items = data?.items ?? [];
  const myStanding = data?.me;
  const aroundMe = data?.around_me ?? [];
  const total = data?.total ?? 0;

  const userIsInTopList = items.some((item) => item.is_current_user);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-yellow-400/10 text-yellow-500 mb-1">
          <Trophy className="w-8 h-8" />
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Bilkeys Leaderboard</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Earn XP by completing quizzes, mastering flashcards, finishing daily review, and maintaining streaks.
        </p>
      </div>

      {/* Primary Controls: Period & Scope */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Period Selector */}
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/50">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPeriod(p.id);
                setPage(1);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                period === p.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Scope Selector */}
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/50">
          {SCOPES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScope(s.id);
                  setPage(1);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  scope === s.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Stats / Metric Selector Toggle */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          Ranking metric: <strong className="text-foreground">{activeMetricObj.label}</strong>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground h-7"
          onClick={() => setShowSecondaryMetrics((v) => !v)}
        >
          {showSecondaryMetrics ? "Hide Statistics Views" : "Stats Views"}
        </Button>
      </div>

      {showSecondaryMetrics && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-muted/30 rounded-xl border border-border/40">
          {SECONDARY_METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMetric(m.id);
                setPage(1);
              }}
              className={`py-1 px-2.5 rounded-md text-xs font-medium transition-colors ${
                metric === m.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/80 text-muted-foreground hover:text-foreground border border-border/40"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Your Standing Card */}
      {me && myStanding && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 border border-primary/20 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your {period === "weekly" ? "Weekly" : "All-Time"} Standing ({scope === "global" ? "Global" : "Friends"})</p>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-extrabold text-primary">
                {myStanding.rank ? `#${myStanding.rank}` : "Unranked"}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {activeMetricObj.format(myStanding.value ?? 0)}
              </span>
            </div>
          </div>

          {myStanding.xp_to_next_rank > 0 && myStanding.next_user_rank && (
            <div className="flex items-center gap-2 text-xs bg-background/80 backdrop-blur border border-primary/20 px-3 py-2 rounded-xl text-primary font-medium">
              <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <span>
                <strong>+{Math.round(myStanding.xp_to_next_rank)} XP</strong> to reach #{myStanding.next_user_rank}
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Main List */}
      {isLoading && <LeaderboardListSkeleton rows={8} />}

      {isError && (
        <div className="text-center py-12 bg-card rounded-2xl border border-border p-6 space-y-3">
          <p className="text-muted-foreground text-sm">Could not load leaderboard entries.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && scope === "connections" && items.length === 0 && (
        <div className="text-center py-12 px-6 bg-card rounded-2xl border border-border space-y-3 max-w-md mx-auto">
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <h3 className="font-heading font-semibold text-base">No Friends or Groups Yet</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your Friends & Groups leaderboard will appear once you join a study group or interact with other learners.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setScope("global")}>
            View Global Leaderboard
          </Button>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            {scope === "global" ? "Top 25 Learners" : "Rankings"}
          </h2>
          <div className="space-y-2">
            {items.map((row) => (
              <LeaderRow
                key={`${row.user_id}-${metric}-${row.rank}`}
                rank={row.rank}
                fullName={row.full_name}
                avatarUrl={row.avatar_url}
                value={row.value}
                formatValue={activeMetricObj.format}
                unit={activeMetricObj.unit}
                isMe={row.is_current_user}
              />
            ))}
          </div>
        </div>
      )}

      {/* "Around You" Rankings Section when outside Top 25 */}
      {!isLoading && !isError && !userIsInTopList && aroundMe.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border/60">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Around You
            </h2>
            <span className="text-[11px] text-muted-foreground">Competitors near your position</span>
          </div>
          <div className="space-y-2">
            {aroundMe.map((row) => (
              <LeaderRow
                key={`around-${row.user_id}-${row.rank}`}
                rank={row.rank}
                fullName={row.full_name}
                avatarUrl={row.avatar_url}
                value={row.value}
                formatValue={activeMetricObj.format}
                unit={activeMetricObj.unit}
                isMe={row.is_current_user}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !isError && total > PAGE_SIZE && scope !== "global" && (
        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="mt-6"
        />
      )}
    </div>
  );
}
