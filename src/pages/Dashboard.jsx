import React, { useMemo } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import client from "@/api/client";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";
import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Trophy, ArrowRight, Flame, Swords } from 'lucide-react';
import { Button } from "@/components/ui/button";
import StatCard from "@/components/dashboard/StatCard";
import AchievementsPanel from "@/components/dashboard/AchievementsPanel";
import QuickActions from "@/components/dashboard/QuickActions";
import ScoreRing from "@/components/dashboard/ScoreRing";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user } = useOutletContext();

  const { data: books = [] } = useQuery({
    queryKey: ["books"],
    queryFn: () => fetchAllBooksPages(),
  });

  const { data: flashcardSets = [] } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: async () => {
      const { data } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
      return data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => {
      const { data } = await client.get('/analytics/summary');
      return data;
    },
  });

  const { data: quizPage } = useQuery({
    queryKey: ['quiz-results', 'dashboard-recent'],
    queryFn: async () => {
      const { data } = await client.get('/quiz-results/', { params: { page: 1, size: 5 } });
      return data;
    },
  });

  const quizResults = quizPage?.items ?? [];
  const quizTotal = summary?.quiz_count ?? 0;

  const { data: challenges = [] } = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => {
      const { data } = await client.get("/quiz-challenges/");
      return data;
    },
  });

  const recentSets = flashcardSets.slice(0, 4);
  const recentResults = quizResults;
  const avgScore = Math.round(summary?.avg_score ?? 0);

  const pendingChallenges = challenges.filter(
    c => c.status === "pending" && c.opponent_email === user?.email
  ).length;

  // Calculate daily streak
  const streak = summary?.streak_days ?? 0;

  const last14 = useMemo(() => {
    const rows = summary?.last_14_days ?? [];
    if (rows.length > 0) {
      return rows.map((row) => ({
        date: new Date(`${row.day}T12:00:00`),
        active: row.had_quiz,
      }));
    }
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return { date: d, active: false };
    });
  }, [summary]);

  const greeting = getGreeting();
  const firstName = user?.full_name?.split(" ")[0] || "Learner";

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="font-heading text-3xl lg:text-4xl font-bold text-foreground">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-muted-foreground mt-1 text-base">
          {user?.role === "admin" ? "Manage your learning platform" :
           user?.role === "teacher" ? "Track your students' progress" :
           "Continue your learning journey"}
        </p>
      </motion.div>

      {/* Pending challenge banner */}
      {pendingChallenges > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-5 flex items-center gap-4 bg-gradient-to-r from-accent/20 to-primary/10 border border-accent/30 rounded-2xl px-5 py-3"
        >
          <Swords className="w-5 h-5 text-accent flex-shrink-0" />
          <p className="text-sm font-semibold flex-1">
            You have <span className="text-accent">{pendingChallenges} pending challenge{pendingChallenges !== 1 ? "s" : ""}</span> waiting for you!
          </p>
          <Link to="/challenges">
            <Button size="sm" className="gap-1.5">
              Accept <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Quick Actions */}
      <QuickActions recentSet={flashcardSets[0]} pendingChallenges={pendingChallenges} />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Books" value={books.length} icon={BookOpen} color="bg-primary/10 text-primary" subtitle="In library" />
        <StatCard title="Flashcard Sets" value={flashcardSets.length} icon={GraduationCap} color="bg-accent/10 text-accent" subtitle="Created" />
        <StatCard title="Quizzes Taken" value={quizTotal} icon={Trophy} color="bg-green-500/10 text-green-500" subtitle="Total played" />

        {/* Avg Score with ring */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <ScoreRing percentage={avgScore} size={60} stroke={5} />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Avg Score</p>
            <p className="text-xs text-muted-foreground mt-0.5">Across all quizzes</p>
          </div>
        </motion.div>

        {/* Streak card — full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-card rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow col-span-1 sm:col-span-2 lg:col-span-4
            ${streak > 0 ? "border-orange-400/40 bg-gradient-to-br from-orange-500/5 to-red-500/5" : "border-border"}`}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Daily Streak</p>
              <div className="flex items-end gap-2 mt-1">
                <p className="text-4xl font-heading font-bold">{streak}</p>
                <p className="text-lg text-muted-foreground mb-0.5">day{streak !== 1 ? "s" : ""}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {streak === 0 ? "Take a quiz today to start your streak!" :
                 streak === 1 ? "Great start — come back tomorrow!" :
                 streak < 7 ? "Keep it up! 🔥" :
                 streak < 30 ? "You're on fire! 🔥🔥" : "Legendary streak! 🏆"}
              </p>
            </div>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${streak === 0 ? "bg-muted" : "bg-orange-500/10"}`}>
              {streak === 0 ? "💤" : streak < 7 ? "🔥" : streak < 30 ? "🔥🔥" : "🏆"}
            </div>
          </div>

          {/* 14-day dot grid */}
          <div className="flex items-end gap-1.5">
            {last14.map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.03, type: "spring", stiffness: 300 }}
                  title={day.date.toDateString()}
                  className={`w-full rounded-sm transition-all ${day.active
                    ? "bg-orange-400 shadow-sm shadow-orange-400/40"
                    : "bg-muted"}`}
                  style={{ height: day.active ? 20 : 12, opacity: day.active ? 0.7 + (i / 14) * 0.3 : 0.4 }}
                />
                {i % 7 === 6 && (
                  <span className="text-[9px] text-muted-foreground">
                    {day.date.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {summary?.weak_topics?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
        >
          <p className="text-sm font-semibold text-foreground">Topics to review</p>
          <p className="text-xs text-muted-foreground">Sets where recent quiz scores were weaker — tap to open</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.weak_topics.slice(0, 8).map((t) => (
              <Link
                key={`${t.set_id}-${t.title}`}
                to={`/study/${t.set_id}`}
                className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="truncate">{t.title}</span>
                <span className="ml-1.5 shrink-0 text-muted-foreground">{Math.round(t.avg_score)}%</span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Flashcard Sets */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-xl font-semibold">Recent Flashcard Sets</h2>
            <Link to="/flashcard-sets">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                View all <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          {recentSets.length === 0 ? (
            <div className="text-center py-12">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground mb-1">No flashcard sets yet</p>
              {books.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground mb-4">You have {books.length} book{books.length !== 1 ? "s" : ""} — generate flashcards from one!</p>
                  <Link to={`/book/${books[0].id}`}>
                    <Button variant="outline" className="mt-1">Open "{books[0].title}"</Button>
                  </Link>
                </>
              ) : (
                <Link to="/library">
                  <Button variant="outline" className="mt-4">Browse Library</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {recentSets.map((set, i) => (
                <motion.div
                  key={set.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/study/${set.id}`}
                    className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{set.title}</p>
                      <p className="text-xs text-muted-foreground">{set.card_count} cards • {set.book_title}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Quiz Results */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-xl font-semibold">Quiz History</h2>
            <Link to="/quiz-history">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                All <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          {recentResults.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No quizzes taken yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentResults.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-sm font-medium truncate flex-1">{r.set_title}</p>
                    <span className={`text-xs font-bold ${r.percentage >= 80 ? "text-green-500" : r.percentage >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                      {r.percentage}%
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${r.percentage}%` }}
                      transition={{ delay: i * 0.05 + 0.2, duration: 0.6, ease: "easeOut" }}
                      className={`h-full rounded-full ${r.percentage >= 80 ? "bg-green-500" : r.percentage >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{r.score}/{r.total_questions} correct</p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Achievements */}
      <div className="mt-6">
        <AchievementsPanel
          user={user}
          quizResults={quizResults}
          quizCount={quizTotal}
          hasPerfectQuiz={summary?.has_perfect_quiz}
          flashcardSets={flashcardSets}
          streak={streak}
          challenges={challenges}
        />
      </div>

      {/* Quick Start — only shown when no activity yet */}
      {quizTotal === 0 && flashcardSets.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 rounded-2xl border border-primary/10 p-8 text-center"
        >
          <Flame className="w-10 h-10 mx-auto text-accent mb-3" />
          <h3 className="font-heading text-xl font-bold mb-2">Ready to Learn?</h3>
          <p className="text-muted-foreground mb-5 max-w-md mx-auto">
            Upload a book, select topics, generate flashcards, and test your knowledge with gamified quizzes.
          </p>
          <Link to="/library">
            <Button size="lg" className="gap-2 px-8">
              <BookOpen className="w-5 h-5" /> Go to Library
            </Button>
          </Link>
        </motion.div>
      )}
    </div>
  );
}