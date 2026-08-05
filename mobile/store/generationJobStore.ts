import { create } from "zustand";

export type GenerationJob = {
  jobId: string;
  bookId: string;
  bookTitle: string;
  userId: string;
  phase: string | null;
  chaptersTotal: number | null;
  chaptersDone: number | null;
  percentComplete: number | null;
  claimed?: boolean;
};

type GenerationJobState = {
  jobs: GenerationJob[];
  startJob: (job: Pick<GenerationJob, "jobId" | "bookId" | "bookTitle" | "userId">) => void;
  updateJob: (jobId: string, patch: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  claimCompletedJob: (jobId: string, userId: string) => GenerationJob | null;
  clearJobsForUser: (userId: string) => void;
  getBookJob: (bookId: string, userId?: string) => GenerationJob | undefined;
};

export const useGenerationJobStore = create<GenerationJobState>((set, get) => ({
  jobs: [],
  startJob: (job) =>
    set((state) => ({
      jobs: [
        ...state.jobs.filter((j) => j.jobId !== job.jobId && j.bookId !== job.bookId),
        {
          ...job,
          phase: "starting",
          chaptersTotal: null,
          chaptersDone: null,
          percentComplete: null,
          claimed: false,
        },
      ],
    })),
  updateJob: (jobId, patch) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)),
    })),
  removeJob: (jobId) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.jobId !== jobId),
    })),
  claimCompletedJob: (jobId, userId) => {
    const job = get().jobs.find((j) => j.jobId === jobId && j.userId === userId && !j.claimed);
    if (!job) return null;
    set((state) => ({
      jobs: state.jobs.filter((j) => j.jobId !== jobId),
    }));
    return job;
  },
  clearJobsForUser: (userId) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.userId !== userId),
    })),
  getBookJob: (bookId, userId) =>
    get().jobs.find((j) => j.bookId === bookId && (!userId || j.userId === userId)),
}));
