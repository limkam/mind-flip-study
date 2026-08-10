import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GenerateProgressBar } from "../../components/GenerateProgressBar";
import { TocEditor } from "../../components/library/TocEditor";
import { Screen } from "../../components/Screen";
import { SelectedChaptersList } from "../../components/study/SelectedChaptersList";
import { api } from "../../api/client";
import { useJobPoll } from "../../hooks/useJobPoll";
import { generationPhaseLabel } from "../../lib/generationPhases";
import { getTocErrorFromBook, getTocJobIdFromBook, isTocExtractionInProgress } from "../../lib/bookToc";
import { chapterSelectionSubtitle, cardsGeneratedLabel, displayChapterHeading } from "../../lib/studySetDisplay";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { useGenerationJobStore } from "../../store/generationJobStore";
import { useAuthStore } from "../../store/authStore";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { SUMMARY_DETAIL_OPTIONS, type SummaryDetailLevel } from "../../lib/summaryScope";
import type { BookOut, JobEnqueueResponse, JobStatusResponse } from "../../types/api";

const TOC_PHASE_LABELS: Record<string, string> = {
  extracting_contents: "Extracting contents…",
  analyzing_structure: "Analyzing document structure…",
  extracting_toc: "Analyzing document structure…",
};

function tocPhaseLabel(phase?: string | null) {
  return (phase && TOC_PHASE_LABELS[phase]) || "Processing…";
}

const PLAN_CARD_COUNTS = [5, 20, 30, 50] as const;
type PlanCardCount = (typeof PLAN_CARD_COUNTS)[number];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function BookByIdScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const startJob = useGenerationJobStore((s) => s.startJob);
  const activeBookJob = useGenerationJobStore((s) => (id ? s.getBookJob(id) : undefined));

  const [cardCount, setCardCount] = useState<PlanCardCount>(5);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({});
  const [genError, setGenError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tocJobId, setTocJobId] = useState<string | null>(null);
  const [tocPhase, setTocPhase] = useState<string | null>(null);
  const [tocError, setTocError] = useState<string | null>(null);
  const [editingToc, setEditingToc] = useState(false);
  const [summaryDetailLevel, setSummaryDetailLevel] = useState<SummaryDetailLevel>("standard");
  const [deleting, setDeleting] = useState(false);
  const [deletionSucceeded, setDeletionSucceeded] = useState(false);
  const confirmationOpenRef = useRef(false);
  const deletionInFlightRef = useRef(false);
  const deletionNavigatedRef = useRef(false);
  const mountedRef = useRef(true);
  const currentBookIdRef = useRef(id);
  const currentUserIdRef = useRef(userId);

  currentBookIdRef.current = id;
  currentUserIdRef.current = userId;

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const validBookId = typeof id === "string" && UUID_PATTERN.test(id);

  const { data: book, isLoading, isError, refetch } = useQuery({
    queryKey: ["book", id],
    enabled: validBookId && !deletionSucceeded,
    queryFn: async () => {
      const { data } = await api.get<BookOut>(`/books/${id}`);
      return data;
    },
    refetchInterval: (query) => {
      const b = query.state.data;
      return isTocExtractionInProgress(b) || tocJobId ? 2000 : false;
    },
  });

  const { data: entitlements, isLoading: entitlementsLoading } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: async () => {
      const { data } = await api.get<{
        raw_plan_features?: { max_cards_per_set?: number | null };
      }>("/billing/entitlements/me");
      return data;
    },
  });

  useEffect(() => {
    const allowed = Number(entitlements?.raw_plan_features?.max_cards_per_set || 5);
    setCardCount(PLAN_CARD_COUNTS.includes(allowed as PlanCardCount) ? allowed as PlanCardCount : 5);
  }, [entitlements?.raw_plan_features?.max_cards_per_set]);

  useEffect(() => {
    setTocJobId(null);
    setTocPhase(null);
    setTocError(null);
  }, [id]);

  useEffect(() => {
    if (!book) return;
    const err = getTocErrorFromBook(book);
    if (err && !isTocExtractionInProgress(book)) {
      setTocError(err);
    }
    const jobId = getTocJobIdFromBook(book);
    if (isTocExtractionInProgress(book) && jobId) {
      setTocJobId((current) => current || jobId);
      setTocPhase(book.processing_phase ?? "extracting_contents");
      setTocError(null);
    }
  }, [book]);

  const fetchTocJobStatus = useCallback(async () => {
    if (!tocJobId) throw new Error("no job");
    const { data } = await api.get<JobStatusResponse>(`/jobs/${tocJobId}`);
    setTocPhase(data.phase ?? null);
    return data;
  }, [tocJobId]);

  useJobPoll(tocJobId, fetchTocJobStatus, {
    intervalMs: 1500,
    onTerminal: async (data) => {
      if (data.status === "complete") {
        const result = await refetch();
        const fresh = result.data;
        const chapters = fresh?.table_of_contents ?? [];
        setTocJobId(null);
        setTocPhase(null);
        if (chapters.length > 0) {
          setTocError(null);
        } else {
          setTocError("No chapters could be extracted from this PDF. Try again or add chapters manually.");
        }
      } else {
        setTocJobId(null);
        setTocPhase(null);
        setTocError(String((data.result as { error?: string })?.error ?? "TOC extraction failed"));
        await refetch();
      }
    },
  });

  const extractToc = async () => {
    if (!id) return;
    setTocError(null);
    setTocPhase("extracting_contents");
    try {
      const { data: job } = await api.post<{ job_id: string }>(`/books/${id}/extract-toc`);
      setTocJobId(job.job_id);
    } catch (e: unknown) {
      setTocPhase(null);
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Request failed")
          : "Request failed";
      setTocError(msg);
    }
  };

  const chapters = book?.table_of_contents ?? [];
  const chapterCardCounts = book?.chapter_card_counts ?? {};
  const tocKey = JSON.stringify(book?.table_of_contents ?? null);

  useEffect(() => {
    if (!book?.id) return;
    setSelectedChapter("");
  }, [book?.id, tocKey]);

  const selectChapter = (title: string) => {
    setSelectedChapter((prev) => (prev === title ? "" : title));
  };

  const toggleExpand = (idx: number) => {
    setExpandedChapters((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const generateInFlightRef = useRef(false);
  const currentAttemptIdRef = useRef(0);

  const startGenerate = async () => {
    if (generateInFlightRef.current || !book || !id || !userId || !validBookId) return;
    if (!selectedChapter) {
      setGenError("Select one chapter.");
      return;
    }

    generateInFlightRef.current = true;
    currentAttemptIdRef.current += 1;
    const attemptId = currentAttemptIdRef.current;

    setGenError(null);
    setStarting(true);
    try {
      const selectedChapters = selectedChapter ? [selectedChapter] : [];
      const { data: job } = await api.post<JobEnqueueResponse>("/flashcard-sets/generate", {
        book_id: book.id,
        title: book.title,
        num_cards: cardCount,
        selected_chapters: selectedChapters,
        summary_detail_level: summaryDetailLevel,
      });

      if (
        !mountedRef.current ||
        currentAttemptIdRef.current !== attemptId ||
        currentBookIdRef.current !== id ||
        currentUserIdRef.current !== userId ||
        useAuthStore.getState().bootstrapStatus !== "authenticated" ||
        useAuthStore.getState().user?.id !== userId
      ) {
        return;
      }

      if (job.reused) {
        if (!job.set_id || !UUID_PATTERN.test(job.set_id)) {
          throw new Error("MindFlip couldn't open the generated set. Please try again.");
        }
        setStarting(false);
        const existingBookJob = useGenerationJobStore.getState().getBookJob(id, userId);
        if (existingBookJob) {
          useGenerationJobStore.getState().removeJob(existingBookJob.jobId);
        }
        void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
        void queryClient.invalidateQueries({ queryKey: ["book", id] });
        router.push(`/study/${job.set_id}`);
        return;
      }

      if (!job.job_id) {
        throw new Error("MindFlip couldn't start generating flashcards. Please try again.");
      }

      startJob({ jobId: job.job_id, bookId: id, bookTitle: book.title, userId });
      void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
    } catch (e: unknown) {
      if (
        !mountedRef.current ||
        currentAttemptIdRef.current !== attemptId ||
        currentBookIdRef.current !== id ||
        currentUserIdRef.current !== userId
      ) {
        return;
      }

      if ((e as { response?: { status?: number } })?.response?.status === 402) return;
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string | { message?: string } } } }).response?.data?.detail ?? "Request failed")
          : (e instanceof Error ? e.message : "Request failed");
      const detailStr = typeof msg === "object" && msg !== null && "message" in msg ? String((msg as { message: string }).message) : String(msg);
      setGenError(detailStr);
    } finally {
      generateInFlightRef.current = false;
      if (mountedRef.current && currentAttemptIdRef.current === attemptId) {
        setStarting(false);
      }
    }
  };

  const isGenerating = !!activeBookJob || starting;
  const canGenerate = !isGenerating && !entitlementsLoading && !!selectedChapter;

  const deleteBook = async (expectedBookId: string, expectedUserId: string) => {
    if (deletionInFlightRef.current || deletionNavigatedRef.current) return;
    deletionInFlightRef.current = true;
    setDeleting(true);
    try {
      const currentRouteId = Array.isArray(routeId) ? routeId[0] : routeId;
      const auth = useAuthStore.getState();
      if (
        currentRouteId !== expectedBookId
        || book?.id !== expectedBookId
        || !UUID_PATTERN.test(expectedBookId)
        || auth.bootstrapStatus !== "authenticated"
        || !auth.user?.id
        || auth.user.id !== expectedUserId
      ) {
        throw new Error("The book or signed-in account changed. Please try again.");
      }

      const response = await api.delete(`/books/${expectedBookId}`);
      if (response.status !== 204) {
        throw new Error("MindFlip couldn't confirm that the book was deleted. Please try again.");
      }
      const completedBookJob = useGenerationJobStore.getState().getBookJob(expectedBookId);
      if (completedBookJob) useGenerationJobStore.getState().removeJob(completedBookJob.jobId);
      await queryClient.cancelQueries({ queryKey: ["book", expectedBookId], exact: true });
      queryClient.removeQueries({ queryKey: ["book", expectedBookId], exact: true });

      if (
        !mountedRef.current
        || currentBookIdRef.current !== expectedBookId
        || currentUserIdRef.current !== expectedUserId
        || useAuthStore.getState().bootstrapStatus !== "authenticated"
        || useAuthStore.getState().user?.id !== expectedUserId
      ) return;

      deletionNavigatedRef.current = true;
      setDeletionSucceeded(true);

      queryClient.removeQueries({ queryKey: ["study-session"] });
      queryClient.removeQueries({ queryKey: ["game-set"] });
      queryClient.removeQueries({ queryKey: ["quiz-result"] });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["books"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["books-daily-review"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["flashcard-sets"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["daily-review-queue"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["quiz-results"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["quiz-challenges"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["analytics-summary"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["analytics-me"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["scorecards"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["achievements"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["folders"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["study-group"], refetchType: "none" }),
      ]);
      if (!mountedRef.current) return;
      router.replace("/(tabs)/library");
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401) return;
      if (
        !mountedRef.current
        || currentBookIdRef.current !== expectedBookId
        || currentUserIdRef.current !== expectedUserId
      ) return;
      const message = status === 403
        ? "You do not have permission to delete this book."
        : status === 404
          ? "This book is already unavailable or you no longer have access to it."
          : status === 409
            ? "The book could not be deleted because it is currently in use. Try again."
            : status === 422
              ? "The book link is invalid. Return to your library and try again."
              : getApiErrorMessage(error, "Check your connection and try again.");
      Alert.alert("Could not delete book", message);
    } finally {
      if (mountedRef.current && !deletionNavigatedRef.current) {
        deletionInFlightRef.current = false;
        setDeleting(false);
      }
    }
  };

  const confirmDelete = () => {
    if (
      confirmationOpenRef.current
      || deletionInFlightRef.current
      || !validBookId
      || !book
      || bootstrapStatus !== "authenticated"
      || !userId
      || book.id !== id
    ) return;
    confirmationOpenRef.current = true;
    const expectedBookId = id;
    const expectedUserId = userId;
    Alert.alert(
      "Delete this book?",
      `This permanently deletes “${book.title}”, its generated flashcards, study progress, and quiz history. It also removes related references from collections and study-group materials. This cannot be undone. Running generation jobs may not be canceled.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => { confirmationOpenRef.current = false; } },
        {
          text: "Delete Book",
          style: "destructive",
          onPress: () => {
            confirmationOpenRef.current = false;
            void deleteBook(expectedBookId, expectedUserId);
          },
        },
      ],
      { cancelable: true, onDismiss: () => { confirmationOpenRef.current = false; } },
    );
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: book?.title ?? "Book" }} />
      {deletionSucceeded ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : isError ? (
        <View style={styles.center}>
          <Text style={[styles.error, { color: colors.danger }]}>Could not load this book.</Text>
          <Pressable style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Retry</Text>
          </Pressable>
        </View>
      ) : book ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
          <Text style={[styles.title, { color: colors.text }]}>{book.title}</Text>
          {book.author ? <Text style={[styles.meta, { color: colors.muted }]}>{book.author}</Text> : null}
          <Text style={[styles.meta, { color: colors.muted }]}>
            {chapters.length > 0
              ? `${chapters.length} chapter${chapters.length !== 1 ? "s" : ""} extracted`
              : isTocExtractionInProgress(book) || tocJobId || tocPhase
                ? "Extracting table of contents…"
                : tocError
                  ? "TOC extraction failed"
                  : "TOC not extracted yet"}
          </Text>
          {book.description ? (
            <Text style={[styles.body, { color: colors.text }]}>{book.description}</Text>
          ) : null}

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Table of contents</Text>
                <Text style={[styles.sectionSub, { color: colors.muted }]}>
                  {editingToc
                    ? "Edit chapters — rename, merge, split, reorder, add, or delete"
                    : "Select one chapter to generate flashcards from"}
                </Text>
              </View>
            </View>

            {chapters.length === 0 ? (
              isTocExtractionInProgress(book) || tocJobId || tocPhase ? (
                <View style={styles.tocEmpty}>
                  <ActivityIndicator color={colors.primary} style={{ marginBottom: 12 }} />
                  <Text style={[styles.emptyToc, { color: colors.text, fontWeight: "600" }]}>
                    {tocPhaseLabel(tocPhase || book.processing_phase)}
                  </Text>
                  <Text style={[styles.emptyToc, { color: colors.muted, marginTop: 8 }]}>
                    Extracting the table of contents from your document.
                  </Text>
                </View>
              ) : tocError ? (
                <View style={styles.tocEmpty}>
                  <Text style={[styles.emptyToc, { color: colors.danger, fontWeight: "600" }]}>
                    TOC extraction failed
                  </Text>
                  <Text style={[styles.error, { color: colors.muted, marginTop: 8 }]}>{tocError}</Text>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                    onPress={() => {
                      void hapticImpact("light");
                      void extractToc();
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Retry TOC Extraction</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.tocEmpty}>
                  <Text style={[styles.emptyToc, { color: colors.muted }]}>
                    No chapters yet. Start extraction to generate flashcards by chapter.
                  </Text>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                    onPress={() => {
                      void hapticImpact("light");
                      void extractToc();
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Extract Table of Contents</Text>
                  </Pressable>
                </View>
              )
            ) : editingToc ? (
              <TocEditor
                bookId={book.id}
                chapters={chapters.map((ch, i) => ({
                  chapter_number: ch.chapter_number ?? i + 1,
                  title: ch.title ?? `Chapter ${i + 1}`,
                  subtopics: ch.subtopics ?? [],
                }))}
                onSaved={() => {
                  void refetch();
                  setEditingToc(false);
                }}
              />
            ) : (
              chapters.map((chapter, idx) => {
                const t = chapter.title ?? `Chapter ${idx + 1}`;
                const chapterNumber = idx + 1;
                const on = selectedChapter === t;
                const expanded = expandedChapters[idx];
                const hasSubs = (chapter.subtopics?.length ?? 0) > 0;
                const cardsLabel = cardsGeneratedLabel(chapterCardCounts[t]);
                const cardCount = chapterCardCounts[t] ?? 0;
                const hasCards = cardCount > 0;
                const generatedBg = isDark ? "#052e16" : "#ecfdf5";
                const generatedBorder = isDark ? "#065f46" : "#a7f3d0";
                return (
                  <View
                    key={`${t}-${idx}`}
                    style={[
                      styles.chapterCard,
                      {
                        borderColor: on ? colors.primary : hasCards ? generatedBorder : colors.border,
                        backgroundColor: on ? `${colors.primary}10` : hasCards ? generatedBg : colors.background,
                      },
                    ]}
                  >
                    <Pressable style={styles.chapterRow} onPress={() => selectChapter(t)}>
                      <View style={[styles.chBox, styles.radioOuter, { borderColor: on ? colors.primary : colors.border }]}>
                        {on ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.chTitle, { color: colors.text }]}>{displayChapterHeading(t, chapterNumber)}</Text>
                        {hasCards ? (
                          <View style={styles.generatedRow}>
                            <View style={[styles.checkBadge, { backgroundColor: colors.success }]}>
                              <Text style={styles.checkMark}>✓</Text>
                            </View>
                            <Text style={[styles.cardsGenerated, { color: colors.success }]}>{cardsLabel}</Text>
                          </View>
                        ) : null}
                      </View>
                      {hasSubs ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            void hapticImpact("light");
                            toggleExpand(idx);
                          }}
                        >
                          <Text style={{ color: colors.muted, fontSize: 16 }}>{expanded ? "▼" : "▶"}</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                    {expanded && hasSubs ? (
                      <View style={styles.subtopics}>
                        {chapter.subtopics!.map((sub, si) => (
                          <Text key={si} style={[styles.subtopic, { color: colors.muted }]}>
                            • {sub}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Generate flashcards</Text>
            {selectedChapter ? (
              <>
                <Text style={[styles.sectionSub, { color: colors.primary, fontWeight: "600" }]}>
                  {chapterSelectionSubtitle(1)}
                </Text>
                <SelectedChaptersList chapters={[selectedChapter]} />
              </>
            ) : (
              <Text style={[styles.sectionSub, { color: colors.muted, marginBottom: 12 }]}>
                Select one chapter above to generate flashcards
              </Text>
            )}

            <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Number of flashcards</Text>
            {entitlementsLoading ? <ActivityIndicator color={colors.primary} /> : <View style={styles.countRow}>
              <View
                style={[
                  styles.countChip,
                  { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
                ]}
              >
                <Text style={[styles.countNum, { color: colors.primary }]}>{cardCount}</Text>
                <Text style={[styles.countLabel, { color: colors.muted }]}>cards per set</Text>
              </View>
            </View>}
            <Text style={[styles.sectionSub, { color: colors.muted }]}>This is the set size included with your current plan.</Text>

            {genError ? <Text style={[styles.error, { color: colors.danger }]}>{genError}</Text> : null}

            {activeBookJob ? (
              <View style={[styles.progressBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}33` }]}>
                <Text style={[styles.progressTitle, { color: colors.text }]}>Generating flashcards…</Text>
                <Text style={[styles.progressHint, { color: colors.muted }]}>
                  This may take a few moments. You may continue using MindFlip while generation completes.
                </Text>
                <GenerateProgressBar
                  phase={activeBookJob.phase}
                  label={generationPhaseLabel(activeBookJob.phase)}
                  chaptersTotal={activeBookJob.chaptersTotal}
                  chaptersDone={activeBookJob.chaptersDone}
                  percentComplete={activeBookJob.percentComplete}
                />
              </View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, !canGenerate && { opacity: 0.6 }]}
              disabled={!canGenerate}
              onPress={() => {
                void hapticImpact("light");
                void startGenerate();
              }}
            >
              {isGenerating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Generate {cardCount} flashcards</Text>
              )}
            </Pressable>
          </View>

          <View style={[styles.dangerSection, { borderColor: colors.danger }]}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>Delete book</Text>
            <Text style={[styles.sectionSub, { color: colors.muted }]}>Permanently remove this book and its generated study content.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${book.title}`}
              accessibilityHint="Opens a confirmation before permanently deleting this book"
              disabled={deleting}
              onPress={confirmDelete}
              style={[styles.deleteBtn, { backgroundColor: colors.danger }, deleting && styles.disabledBtn]}
            >
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Delete Book</Text>}
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  center: { padding: 24, alignItems: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 6 },
  meta: { fontSize: 15, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 8 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  sectionSub: { fontSize: 13, marginTop: 4 },
  linkBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  linkBtnText: { fontSize: 12, fontWeight: "700" },
  nativeToc: { fontSize: 11, marginTop: 4, fontWeight: "600" },
  tocWarning: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "rgba(180, 83, 9, 0.08)",
  },
  detailRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  detailChip: {
    flex: 1,
    minWidth: "30%",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  emptyToc: { fontSize: 14, lineHeight: 20, textAlign: "center", paddingVertical: 8 },
  tocEmpty: { alignItems: "center", paddingVertical: 12 },
  chapterCard: { borderRadius: 12, borderWidth: 1, marginBottom: 8, overflow: "hidden" },
  chapterRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  chBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuter: { borderRadius: 11 },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  chNum: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
    overflow: "hidden",
  },
  chTitle: { fontSize: 14, fontWeight: "600" },
  generatedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  checkBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: "#fff", fontSize: 10, fontWeight: "800", lineHeight: 12 },
  cardsGenerated: { fontSize: 12, fontWeight: "600" },
  subtopics: { paddingHorizontal: 12, paddingBottom: 12, paddingLeft: 44, gap: 4 },
  subtopic: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  countRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  countChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  countNum: { fontSize: 20, fontWeight: "800" },
  countLabel: { fontSize: 11, marginTop: 2 },
  error: { fontSize: 13, marginBottom: 8 },
  progressBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  progressTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  progressHint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dangerSection: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 24 },
  deleteBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", minHeight: 48, justifyContent: "center", marginTop: 12 },
  disabledBtn: { opacity: 0.6 },
});
