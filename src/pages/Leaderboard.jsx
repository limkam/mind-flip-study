import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Pagination from "@/components/pagination/Pagination";
import { LeaderboardListSkeleton } from "@/components/skeletons";

const PAGE_SIZE = 50;

const TABS = [
  { id: "avg_score", label: "Avg Score", unit: "%", format: (v) => `${v}%` },
  { id: "most_quizzes", label: "Most Quizzes", unit: "quizzes", format: (v) => String(Math.round(v)) },
  { id: "cards_mastered", label: "Cards Mastered", unit: "cards", format: (v) => String(Math.round(v)) },
];

function RankIcon({ rank }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
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
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(rank, 20) * 0.03 }}
      className={`flex items-center gap-4 p-4 rounded-xl transition-colors
        ${rank <= 3 ? "bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10" : "bg-muted/40"}
        ${isMe ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="w-7 flex items-center justify-center flex-shrink-0">
        <RankIcon rank={rank} />
      </div>
      <Avatar className="w-9 h-9 flex-shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback
          className={`text-sm font-semibold ${rank === 1 ? "bg-yellow-400/20 text-yellow-600" : "bg-primary/10 text-primary"}`}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {displayName}
          {isMe && <span className="text-xs text-primary font-semibold"> (you)</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-heading font-bold text-base">{formatValue(value)}</p>
        <p className="text-xs text-muted-foreground capitalize">{unit}</p>
      </div>
    </motion.div>
  );
}

export default function Leaderboard() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [metric, setMetric] = useState("avg_score");

  const activeTab = TABS.find((t) => t.id === metric) || TABS[0];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leaderboard", metric, page, PAGE_SIZE],
    queryFn: async () => {
      const { data: body } = await client.get("/leaderboard", {
        params: { page, size: PAGE_SIZE, metric },
      });
      return body;
    },
  });

  const { data: myRank } = useQuery({
    queryKey: ["leaderboard", "me", metric],
    queryFn: async () => {
      const { data: body } = await client.get("/leaderboard/me", { params: { metric } });
      return body;
    },
    enabled: !!me,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const handleTabChange = (id) => {
    setMetric(id);
    setPage(1);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
        <h1 className="font-heading text-3xl font-bold">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">See how you rank against other learners</p>
      </motion.div>

      <div className="flex gap-2 mb-6 p-1 bg-muted/50 rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              metric === tab.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {me && myRank && (
        <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/15 text-center text-sm">
          <span className="text-muted-foreground">Your standing ({activeTab.label}): </span>
          <span className="font-semibold">
            {myRank.rank != null ? `#${myRank.rank}` : "Not ranked yet"}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold">{activeTab.format(myRank.value ?? 0)}</span>
        </div>
      )}

      {isLoading && <LeaderboardListSkeleton rows={8} />}
      {isError && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">Could not load leaderboard.</p>
          <button type="button" className="text-primary underline text-sm" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          No leaderboard data yet — complete a quiz or master cards to appear.
        </p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-2">
          {items.map((row) => (
            <LeaderRow
              key={`${row.user_id}-${metric}`}
              rank={row.rank}
              fullName={row.full_name}
              avatarUrl={row.avatar_url}
              value={row.value}
              formatValue={activeTab.format}
              unit={activeTab.unit}
              isMe={me?.id === row.user_id}
            />
          ))}
        </div>
      )}
      {!isLoading && !isError && total > 0 && (
        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="mt-8"
        />
      )}
    </div>
  );
}
