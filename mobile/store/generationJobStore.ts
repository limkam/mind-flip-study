import { create } from "zustand";

export type GenerationJob = {
  jobId: string;
  bookId: string;
  bookTitle: string;
  phase: string | null;
  chaptersTotal: number | null;
  chaptersDone: number | null;
  percentComplete: number | null;
};

type GenerationJobState = {
  jobs: GenerationJob[];
  startJob: (job: Pick<GenerationJob, "jobId" | "bookId" | "bookTitle">) => void;
  updateJob: (jobId: string, patch: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  getBookJob: (bookId: string) => GenerationJob | undefined;
};

export const useGenerationJobStore = create<GenerationJobState>((set, get) => ({
  jobs: [],
  startJob: (job) =>
    set((state) => ({
      jobs: [
        ...state.jobs.filter((j) => j.jobId !== job.jobId),
        {
          ...job,
          phase: "starting",
          chaptersTotal: null,
          chaptersDone: null,
          percentComplete: null,
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
  getBookJob: (bookId) => get().jobs.find((j) => j.bookId === bookId),
}));
