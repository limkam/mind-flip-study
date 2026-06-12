import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { Alert } from "react-native";

import { api } from "../api/client";
import { useJobPoll } from "../hooks/useJobPoll";
import { extractJobError, extractSetIdFromJob } from "../lib/generationPhases";
import { useGenerationJobStore } from "../store/generationJobStore";
import type { FlashcardSetOut, JobStatusResponse } from "../types/api";

function ActiveJobPoller({
  jobId,
  bookId,
  bookTitle,
}: {
  jobId: string;
  bookId: string;
  bookTitle: string;
}) {
  const updateJob = useGenerationJobStore((s) => s.updateJob);
  const removeJob = useGenerationJobStore((s) => s.removeJob);
  const queryClient = useQueryClient();
  const router = useRouter();

  const fetchStatus = useCallback(async () => {
    const { data } = await api.get<JobStatusResponse>(`/jobs/${jobId}`);
    updateJob(jobId, {
      phase: data.phase ?? null,
      chaptersTotal: data.chapters_total ?? null,
      chaptersDone: data.chapters_done ?? null,
      percentComplete: data.percent_complete ?? null,
    });
    return data;
  }, [jobId, updateJob]);

  useJobPoll(jobId, fetchStatus, {
    intervalMs: 2000,
    onTerminal: async (body) => {
      const setId = extractSetIdFromJob(body);

      if (body.status === "complete" && setId) {
        void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
        removeJob(jobId);
        router.push(`/study/${setId}`);
        return;
      }

      if (body.status === "failed" && bookId) {
        try {
          const { data: sets } = await api.get<FlashcardSetOut[]>("/flashcard-sets/", {
            params: { include_cards: false },
          });
          const recent = (sets || []).find((s) => s.book_id === bookId);
          if (recent?.id) {
            void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
            removeJob(jobId);
            router.push(`/study/${recent.id}`);
            return;
          }
        } catch {
          /* fall through */
        }
      }

      removeJob(jobId);
      Alert.alert("Generation failed", extractJobError(body) || "Please try again.");
    },
  });

  return null;
}

export function GenerationJobPoller() {
  const jobs = useGenerationJobStore((s) => s.jobs);

  return (
    <>
      {jobs.map((job) => (
        <ActiveJobPoller
          key={job.jobId}
          jobId={job.jobId}
          bookId={job.bookId}
          bookTitle={job.bookTitle}
        />
      ))}
    </>
  );
}
