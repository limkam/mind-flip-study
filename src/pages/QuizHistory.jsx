import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '@/api/client';
import { motion } from 'framer-motion';
import { Trophy, Clock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Pagination from '@/components/pagination/Pagination';
import { QuizHistoryListSkeleton } from '@/components/skeletons';

const PAGE_SIZE = 15;

export default function QuizHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quiz-results', 'history', page],
    queryFn: async () => {
      const { data: body } = await client.get('/quiz-results/', {
        params: { page, size: PAGE_SIZE },
      });
      return body;
    },
  });

  const results = data?.items ?? [];
  const total = data?.total ?? 0;

  const formatTime = (secs) => {
    if (!secs) return '-';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (pct) => {
    if (pct >= 80) return 'text-green-500 bg-green-500/10';
    if (pct >= 50) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Quiz Results</h1>
        <p className="text-muted-foreground mt-1">{total} quizzes completed</p>
      </div>

      {isLoading ? (
        <QuizHistoryListSkeleton rows={5} />
      ) : isError ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Could not load quiz history.</p>
          <button type="button" className="text-primary underline text-sm" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-20">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="font-heading text-xl font-semibold text-muted-foreground">No quizzes taken yet</h3>
          <p className="text-muted-foreground mt-2">Take a quiz from your flashcard sets to see results here</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {results.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card rounded-2xl border border-border p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-heading text-lg font-bold ${getScoreColor(r.percentage)}`}
                  >
                    {r.percentage}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{r.set_title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.book_title}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {r.score}/{r.total_questions} correct
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatTime(r.time_taken_seconds)}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={
                      r.percentage >= 80 ? 'default' : r.percentage >= 50 ? 'secondary' : 'destructive'
                    }
                  >
                    {r.percentage >= 80 ? 'Excellent' : r.percentage >= 50 ? 'Good' : 'Needs Work'}
                  </Badge>
                </div>
              </motion.div>
            ))}
          </div>
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="mt-8"
          />
        </>
      )}
    </div>
  );
}
