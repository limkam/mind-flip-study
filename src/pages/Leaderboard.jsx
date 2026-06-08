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

function RankIcon({ rank }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

function LeaderRow({ rank, fullName, avatarUrl, xp, isMe }) {
  const initials = fullName
    ? fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";
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
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="" />
        ) : null}
        <AvatarFallback
          className={`text-sm font-semibold ${rank === 1 ? "bg-yellow-400/20 text-yellow-600" : "bg-primary/10 text-primary"}`}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {fullName || "Anonymous"}
          {isMe && <span className="text-xs text-primary font-semibold"> (you)</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-heading font-bold text-base">{Number.isInteger(xp) ? xp : xp.toFixed(1)}</p>
        <p className="text-xs text-muted-foreground">XP</p>
      </div>
    </motion.div>
  );
}

export default function Leaderboard() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leaderboard", page, PAGE_SIZE],
    queryFn: async () => {
      const { data: body } = await client.get("/leaderboard", {
        params: { page, size: PAGE_SIZE },
      });
      return body;
    },
  });

  const { data: myRank } = useQuery({
    queryKey: ["leaderboard", "me"],
    queryFn: async () => {
      const { data: body } = await client.get("/leaderboard/me");
      return body;
    },
    enabled: !!me,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
        <h1 className="font-heading text-3xl font-bold">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">Top learners by total quiz XP</p>
      </motion.div>

      {me && myRank && (
        <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/15 text-center text-sm">
          <span className="text-muted-foreground">Your standing: </span>
          <span className="font-semibold">
            {myRank.rank != null ? `#${myRank.rank}` : "Not ranked yet"}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold">{myRank.xp ?? 0} XP</span>
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
        <p className="text-center text-muted-foreground py-12">No leaderboard data yet — complete a quiz to appear.</p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-2">
          {items.map((row) => (
            <LeaderRow
              key={row.user_id}
              rank={row.rank}
              fullName={row.full_name}
              avatarUrl={row.avatar_url}
              xp={row.xp}
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
