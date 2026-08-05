import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { Alert } from "react-native";
import axios from "axios";

import { api } from "../api/client";
import { useJobPoll } from "../hooks/useJobPoll";
import { extractJobError, extractSetIdFromJob } from "../lib/generationPhases";
import { useGenerationJobStore } from "../store/generationJobStore";
import { useAuthStore } from "../store/authStore";
import type { FlashcardSetOut, JobStatusResponse } from "../types/api";

function ActiveJobPoller({
  jobId,
  bookId,
  bookTitle,
  userId,
}: {
  jobId: string;
  bookId: string;
  bookTitle: string;
  userId: string;
}) {
  const updateJob = useGenerationJobStore((s) => s.updateJob);
  const removeJob = useGenerationJobStore((s) => s.removeJob);
  const authUserId = useAuthStore((s) => s.user?.id);
  const authStatus = useAuthStore((s) => s.bootstrapStatus);
  const queryClient = useQueryClient();
  const router = useRouter();

  const fetchStatus = useCallback(async () => {
    if (authStatus !== "authenticated" || !authUserId || authUserId !== userId) {
      throw new Error("User identity changed during polling.");
    }
    const { data } = await api.get<JobStatusResponse>(`/jobs/${jobId}`);
    updateJob(jobId, {
      phase: data.phase ?? null,
      chaptersTotal: data.chapters_total ?? null,
      chaptersDone: data.chapters_done ?? null,
      percentComplete: data.percent_complete ?? null,
    });
    return data;
  }, [jobId, updateJob, authStatus, authUserId, userId]);

  useJobPoll(jobId, fetchStatus, {
    intervalMs: 2000,
    onTerminal: async (body) => {
      const currentAuthUser = useAuthStore.getState().user?.id;
      if (useAuthStore.getState().bootstrapStatus !== "authenticated" || !currentAuthUser || currentAuthUser !== userId) {
        removeJob(jobId);
        return;
      }

      const claimed = useGenerationJobStore.getState().claimCompletedJob(jobId, userId);
      if (!claimed) return;

      const setId = extractSetIdFromJob(body);

      if (body.status === "complete" && setId) {
        void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
        void queryClient.invalidateQueries({ queryKey: ["book", bookId] });
        void queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] });
        void queryClient.invalidateQueries({ queryKey: ["credit-usage"] });
        router.push(`/study/${setId}`);
        return;
      }

      Alert.alert("Generation failed", extractJobError(body) || "Please try again.");
    },
    onTimeout: () => {
      removeJob(jobId);
      Alert.alert(
        "Generation status unavailable",
        "Active status tracking paused. Check your library shortly for completed flashcards."
      );
    },
    onErrorStop: (error) => {
      removeJob(jobId);
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 403) {
        Alert.alert("Access denied", "You do not have access to this generation job.");
      } else if (status === 404) {
        Alert.alert("Job unavailable", "The generation job is no longer active. Check your library shortly.");
      } else if (status !== 401) {
        Alert.alert("Connection error", "Unable to retrieve generation job status.");
      }
    },
  });

  return null;
}

export function GenerationJobPoller() {
  const jobs = useGenerationJobStore((s) => s.jobs);
  const userId = useAuthStore((s) => s.user?.id);
  const userJobs = jobs.filter((j) => j.userId === userId);

  return (
    <>
      {userJobs.map((job) => (
        <ActiveJobPoller
          key={job.jobId}
          jobId={job.jobId}
          bookId={job.bookId}
          bookTitle={job.bookTitle}
          userId={job.userId}
        />
      ))}
    </>
  );
}
