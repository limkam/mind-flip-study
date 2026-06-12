import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import { Swords, Crown, Medal, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Pagination from "@/components/pagination/Pagination";
import { LeaderboardListSkeleton } from "@/components/skeletons";

const PAGE_SIZE = 50;
const TABS = [
  { id: "overall", label: "Overall" },
  { id: "by_content", label: "By Content" },
  { id: "badges", label: "My Badges" },
];

function RankIcon({ rank }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

function OverallRow({ row, isMe }) {
  const name = row.full_name || "Learner";
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl ${
        row.rank <= 3 ? "bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10" : "bg-muted/40"
      } ${isMe ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="w-7 flex justify-center"><RankIcon rank={row.rank} /></div>
      <Avatar className="w-9 h-9">
        {row.avatar_url ? <AvatarImage src={row.avatar_url} alt="" /> : null}
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}{isMe ? " (you)" : ""}</p>
        <p className="text-xs text-muted-foreground">{row.wins} wins · {row.activity} quizzes · {row.accuracy}% avg</p>
      </div>
      <div className="text-right">
        <p className="font-heading font-bold">{row.points}</p>
        <p className="text-xs text-muted-foreground">points</p>
      </div>
    </div>
  );
}

function ContentRow({ row }) {
  const name = row.full_name || "Learner";
  return (
    <div className="p-4 rounded-xl bg-muted/40 flex items-center gap-4">
      <div className="w-7 text-center text-sm font-bold text-muted-foreground">#{row.rank}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{row.content_label}</p>
      </div>
      <div className="text-right text-sm">
        <p className="font-semibold">{row.points} pts</p>
        <p className="text-xs text-muted-foreground">{row.accuracy}% · {row.quiz_count} quizzes</p>
      </div>
    </div>
  );
}

function BadgeCard({ badge }) {
  return (
    <div className="p-4 rounded-xl bg-card border border-border flex gap-3 items-start">
      <span className="text-2xl">{badge.icon}</span>
      <div>
        <p className="font-medium text-sm">{badge.title}</p>
        <p className="text-xs text-muted-foreground">{badge.description}</p>
        <p className="text-xs text-primary mt-1 capitalize">{badge.category} badge</p>
      </div>
    </div>
  );
}

export default function ChallengeLeaderboard() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState("overall");
  const [page, setPage] = useState(1);

  const { data: overall, isLoading: loadingOverall } = useQuery({
    queryKey: ["challenge-leaderboard", "overall", page],
    queryFn: async () => {
      const { data } = await client.get("/challenge-leaderboard/overall", {
        params: { page, size: PAGE_SIZE },
      });
      return data;
    },
    enabled: tab === "overall",
  });

  const { data: byContent = [], isLoading: loadingContent } = useQuery({
    queryKey: ["challenge-leaderboard", "by-content"],
    queryFn: async () => {
      const { data } = await client.get("/challenge-leaderboard/by-content", { params: { limit: 30 } });
      return data;
    },
    enabled: tab === "by_content",
  });

  const { data: badges = [], isLoading: loadingBadges } = useQuery({
    queryKey: ["challenge-leaderboard", "badges"],
    queryFn: async () => {
      const { data } = await client.get("/challenge-leaderboard/badges");
      return data;
    },
    enabled: tab === "badges",
  });

  const isLoading = tab === "overall" ? loadingOverall : tab === "by_content" ? loadingContent : loadingBadges;

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <Swords className="w-10 h-10 text-primary mx-auto mb-3" />
        <h1 className="font-heading text-3xl font-bold">Challenge Leaderboard</h1>
        <p className="text-muted-foreground mt-1">Track competition performance and earn badges</p>
      </motion.div>

      <div className="flex gap-2 mb-6 p-1 bg-muted/50 rounded-xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setPage(1); }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <LeaderboardListSkeleton rows={6} />}

      {!isLoading && tab === "overall" && (
        <>
          <div className="space-y-2">
            {(overall?.items ?? []).map((row) => (
              <OverallRow key={row.user_id} row={row} isMe={me?.id === row.user_id} />
            ))}
          </div>
          {(overall?.total ?? 0) > 0 && (
            <Pagination page={page} total={overall.total} pageSize={PAGE_SIZE} onPageChange={setPage} className="mt-8" />
          )}
          {(overall?.items ?? []).length === 0 && (
            <p className="text-center text-muted-foreground py-12">Complete quizzes or win challenges to rank.</p>
          )}
        </>
      )}

      {!isLoading && tab === "by_content" && (
        <div className="space-y-2">
          {byContent.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No content rankings yet.</p>
          ) : (
            byContent.map((row, i) => <ContentRow key={`${row.user_id}-${row.content_key}-${i}`} row={row} />)
          )}
        </div>
      )}

      {!isLoading && tab === "badges" && (
        <div className="space-y-3">
          {badges.length === 0 ? (
            <div className="text-center py-12">
              <Award className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No badges earned yet — keep studying and challenging friends!</p>
            </div>
          ) : (
            badges.map((b) => <BadgeCard key={b.id} badge={b} />)
          )}
        </div>
      )}
    </div>
  );
}
