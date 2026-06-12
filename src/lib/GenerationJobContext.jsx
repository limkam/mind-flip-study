import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import client from '@/api/client';
import { useJobPoll } from '@/hooks/useJobPoll';
import { useToast } from '@/components/ui/use-toast';
import { extractJobError, extractSetIdFromJob } from '@/lib/generationPhases';

const STORAGE_KEY = 'mindflip_generation_jobs';

const GenerationJobContext = createContext(null);

function loadStoredJobs() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistJobs(jobs) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* ignore */
  }
}

function ActiveJobPoller({ job, onUpdate, onTerminal }) {
  useJobPoll(job.jobId, {
    intervalMs: 1500,
    onProgress: (data) => {
      onUpdate(job.jobId, {
        phase: data?.phase || job.phase,
        chaptersTotal: data?.chapters_total ?? job.chaptersTotal,
        chaptersDone: data?.chapters_done ?? job.chaptersDone,
        percentComplete: data?.percent_complete ?? job.percentComplete,
        currentChapter: data?.current_chapter ?? job.currentChapter,
      });
    },
    onTerminal: (data) => onTerminal(job.jobId, data),
  });
  return null;
}

export function GenerationJobProvider({ children }) {
  const [jobs, setJobs] = useState(() => loadStoredJobs());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    persistJobs(jobs);
  }, [jobs]);

  const updateJob = useCallback((jobId, patch) => {
    setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)));
  }, []);

  const removeJob = useCallback((jobId) => {
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  }, []);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const handleTerminal = useCallback(async (jobId, data) => {
    const job = jobsRef.current.find((j) => j.jobId === jobId);
    const setId = extractSetIdFromJob(data);

    if (data.status === 'complete' && setId) {
      queryClient.invalidateQueries({ queryKey: ['flashcard-sets'] });
      toast({
        title: data?.result?.recovered ? 'Flashcards ready' : 'Study content generated!',
        description: job?.bookTitle
          ? `${job.bookTitle} — summary, flashcards, and scenarios are ready.`
          : 'Summary, flashcards, and scenarios are ready.',
        dedupeKey: `generation-complete-${jobId}`,
      });
      removeJob(jobId);
      navigate(`/study/${setId}`);
      return;
    }

    if (data.status === 'failed' && job?.bookId) {
      try {
        const { data: sets } = await client.get('/flashcard-sets/', { params: { include_cards: false } });
        const recent = (sets || []).find((s) => s.book_id === job.bookId);
        if (recent?.id) {
          queryClient.invalidateQueries({ queryKey: ['flashcard-sets'] });
          toast({
            title: 'Flashcards ready',
            description: 'Generation finished — your study set was saved.',
            dedupeKey: `generation-recovered-${jobId}`,
          });
          removeJob(jobId);
          navigate(`/study/${recent.id}`);
          return;
        }
      } catch {
        /* fall through */
      }
    }

    const err = extractJobError(data) || 'Generation failed';
    toast({
      title: 'Generation failed',
      description: err,
      variant: 'destructive',
      dedupeKey: `generation-failed-${jobId}`,
    });
    removeJob(jobId);
  }, [navigate, queryClient, removeJob, toast]);

  const startJob = useCallback(({ jobId, bookId, bookTitle, kind = 'flashcards' }) => {
    setJobs((prev) => {
      const filtered = prev.filter((j) => j.jobId !== jobId);
      return [
        ...filtered,
        {
          jobId,
          bookId,
          bookTitle,
          kind,
          phase: 'starting',
          chaptersTotal: null,
          chaptersDone: null,
          percentComplete: null,
          startedAt: Date.now(),
        },
      ];
    });
  }, []);

  const value = useMemo(
    () => ({ jobs, startJob, updateJob, removeJob }),
    [jobs, startJob, updateJob, removeJob],
  );

  return (
    <GenerationJobContext.Provider value={value}>
      {jobs.map((job) => (
        <ActiveJobPoller
          key={job.jobId}
          job={job}
          onUpdate={updateJob}
          onTerminal={handleTerminal}
        />
      ))}
      {children}
    </GenerationJobContext.Provider>
  );
}

export function useGenerationJobs() {
  const ctx = useContext(GenerationJobContext);
  if (!ctx) {
    throw new Error('useGenerationJobs must be used within GenerationJobProvider');
  }
  return ctx;
}

export function useBookGenerationJob(bookId) {
  const { jobs } = useGenerationJobs();
  return jobs.find((j) => j.bookId === bookId) || null;
}
