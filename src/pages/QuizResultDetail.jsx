import React, { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Trophy, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function QuizResultDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: result, isLoading } = useQuery({
    queryKey: ["quiz-result", id],
    queryFn: async () => {
      const { data } = await client.get(`/quiz-results/${id}`);
      return data;
    },
  });

  const analysis = useMemo(() => {
    const answers = result?.extras?.answers || [];
    const byChapter = {};
    answers.forEach((a) => {
      const ch = a.chapter || "General";
      if (!byChapter[ch]) byChapter[ch] = { correct: 0, total: 0 };
      byChapter[ch].total += 1;
      if (a.is_correct) byChapter[ch].correct += 1;
    });
    const chapters = Object.entries(byChapter).map(([chapter, s]) => ({
      chapter,
      pct: Math.round((s.correct / s.total) * 100),
      ...s,
    }));
    const strong = chapters.filter((c) => c.pct >= 80).map((c) => c.chapter);
    const weak = chapters.filter((c) => c.pct < 60).map((c) => c.chapter);
    return { strong, weak, chapters };
  }, [result]);

  const formatTime = (secs) => {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return <div className="text-center py-20 text-muted-foreground">Loading…</div>;
  }

  if (!result) {
    return <div className="text-center py-20 text-muted-foreground">Result not found</div>;
  }

  const answers = result.extras?.answers || [];

  return (
    <div className="max-w-3xl mx-auto">
      <Button variant="ghost" className="gap-2 mb-6 text-muted-foreground" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">{result.extras?.set_title || "Quiz Result"}</h1>
            {result.extras?.book_title && (
              <p className="text-sm text-muted-foreground">{result.extras.book_title}</p>
            )}
            <div className="flex gap-3 mt-2 text-sm">
              <span className="font-bold text-primary text-lg">{result.percentage}%</span>
              <span className="text-muted-foreground">{result.score}/{result.total_questions} correct</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" /> {formatTime(result.time_taken_seconds)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {(analysis.strong.length > 0 || analysis.weak.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          {analysis.strong.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs font-semibold text-emerald-600 mb-2">Strong Chapters</p>
              {analysis.strong.map((ch) => <Badge key={ch} variant="outline" className="mr-1 mb-1">{ch}</Badge>)}
            </div>
          )}
          {analysis.weak.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-xs font-semibold text-rose-600 mb-2">Recommended Review</p>
              {analysis.weak.map((ch) => <Badge key={ch} variant="outline" className="mr-1 mb-1">{ch}</Badge>)}
            </div>
          )}
        </div>
      )}

      {answers.length > 0 ? (
        <div className="space-y-4">
          <h2 className="font-heading font-semibold">Question Breakdown</h2>
          {answers.map((a, i) => (
            <div key={i} className={`rounded-xl border p-4 ${a.is_correct ? "border-emerald-500/20" : "border-rose-500/20"}`}>
              <div className="flex items-start gap-2 mb-2">
                {a.is_correct
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />}
                <p className="text-sm font-medium">{a.question}</p>
              </div>
              {!a.is_correct && (
                <p className="text-xs text-muted-foreground ml-6 mb-1">
                  Your answer: <span className="text-rose-600">{a.user_answer}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground ml-6 mb-1">
                Correct: <span className="text-emerald-600">{a.correct_answer}</span>
              </p>
              {a.explanation && (
                <p className="text-xs text-muted-foreground ml-6 italic">{a.explanation}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No per-question breakdown available for this result.</p>
      )}

      {result.set_id && (
        <div className="mt-8">
          <Button asChild variant="outline" className="gap-2">
            <Link to={`/study/${result.set_id}`}>
              <BookOpen className="w-4 h-4" /> Back to Flashcard Set
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
