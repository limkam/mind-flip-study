import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GenerateProgressBar } from "../../components/GenerateProgressBar";
import { Screen } from "../../components/Screen";
import { SelectedChaptersList } from "../../components/study/SelectedChaptersList";
import { api } from "../../api/client";
import { useJobPoll } from "../../hooks/useJobPoll";
import { generationPhaseLabel } from "../../lib/generationPhases";
import { chapterSelectionSubtitle } from "../../lib/studySetDisplay";
import { useGenerationJobStore } from "../../store/generationJobStore";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import type { BookOut, JobStatusResponse } from "../../types/api";

const TOC_PHASE_LABELS: Record<string, string> = {
  extracting_contents: "Extracting contents…",
  analyzing_structure: "Analyzing document structure…",
  extracting_toc: "Analyzing document structure…",
};

function tocPhaseLabel(phase?: string | null) {
  return (phase && TOC_PHASE_LABELS[phase]) || "Processing…";
}

const COUNTS = [5, 10, 20, 30, 40, 50] as const;

export default function BookByIdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const startJob = useGenerationJobStore((s) => s.startJob);
  const activeBookJob = useGenerationJobStore((s) => (id ? s.getBookJob(id) : undefined));

  const [cardCount, setCardCount] = useState<(typeof COUNTS)[number]>(20);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({});
  const [genError, setGenError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tocJobId, setTocJobId] = useState<string | null>(null);
  const [tocPhase, setTocPhase] = useState<string | null>(null);
  const [tocError, setTocError] = useState<string | null>(null);

  const { data: book, isLoading, isError, refetch } = useQuery({
    queryKey: ["book", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<BookOut>(`/books/${id}`);
      return data;
    },
    refetchInterval: tocJobId ? 2000 : false,
  });

  const fetchTocJobStatus = useCallback(async () => {
    if (!tocJobId) throw new Error("no job");
    const { data } = await api.get<JobStatusResponse>(`/jobs/${tocJobId}`);
    setTocPhase(data.phase ?? null);
    return data;
  }, [tocJobId]);

  useJobPoll(tocJobId, fetchTocJobStatus, {
    intervalMs: 1500,
    onTerminal: async (data) => {
      setTocJobId(null);
      setTocPhase(null);
      if (data.status === "complete") {
        await refetch();
      } else {
        setTocError(String((data.result as { error?: string })?.error ?? "TOC extraction failed"));
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

  const startGenerate = async () => {
    if (!book || !id) return;
    if (chapters.length > 0 && !selectedChapter) {
      setGenError("Select one chapter.");
      return;
    }
    setGenError(null);
    setStarting(true);
    try {
      const { data: job } = await api.post<{ job_id: string }>("/flashcard-sets/generate", {
        book_id: book.id,
        title: book.title,
        num_cards: cardCount,
        selected_chapters: selectedChapter ? [selectedChapter] : [],
      });
      startJob({ jobId: job.job_id, bookId: id, bookTitle: book.title });
      void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Request failed")
          : "Request failed";
      setGenError(msg);
    } finally {
      setStarting(false);
    }
  };

  const isGenerating = !!activeBookJob || starting;
  const canGenerate = !isGenerating && !(chapters.length > 0 && !selectedChapter);

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: book?.title ?? "Book" }} />
      {isLoading ? (
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
                  Select one chapter to generate flashcards from
                </Text>
              </View>
            </View>

            {chapters.length === 0 ? (
              tocJobId || tocPhase ? (
                <View style={styles.tocEmpty}>
                  <ActivityIndicator color={colors.primary} style={{ marginBottom: 12 }} />
                  <Text style={[styles.emptyToc, { color: colors.text, fontWeight: "600" }]}>
                    {tocPhaseLabel(tocPhase)}
                  </Text>
                  <Text style={[styles.emptyToc, { color: colors.muted, marginTop: 8 }]}>
                    Reading your PDF and building a structured chapter list.
                  </Text>
                </View>
              ) : (
                <View style={styles.tocEmpty}>
                  <Text style={[styles.emptyToc, { color: colors.muted }]}>
                    Extract the table of contents to select chapters for flashcards.
                  </Text>
                  {tocError ? <Text style={[styles.error, { color: colors.danger }]}>{tocError}</Text> : null}
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                    onPress={() => {
                      void hapticImpact("light");
                      void extractToc();
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Extract Table of Contents (TOC)</Text>
                  </Pressable>
                </View>
              )
            ) : (
              chapters.map((chapter, idx) => {
                const t = chapter.title ?? `Chapter ${idx + 1}`;
                const on = selectedChapter === t;
                const expanded = expandedChapters[idx];
                const hasSubs = (chapter.subtopics?.length ?? 0) > 0;
                return (
                  <View
                    key={`${t}-${idx}`}
                    style={[
                      styles.chapterCard,
                      { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}10` : colors.background },
                    ]}
                  >
                    <Pressable style={styles.chapterRow} onPress={() => selectChapter(t)}>
                      <View style={[styles.chBox, styles.radioOuter, { borderColor: on ? colors.primary : colors.border }]}>
                        {on ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.chNum, { color: colors.muted, backgroundColor: colors.border + "55" }]}>
                          Ch. {chapter.chapter_number ?? idx + 1}
                        </Text>
                        <Text style={[styles.chTitle, { color: colors.text }]}>{t}</Text>
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
            <View style={styles.countRow}>
              {COUNTS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    void hapticImpact("light");
                    setCardCount(n);
                  }}
                  style={[
                    styles.countChip,
                    { borderColor: colors.border, backgroundColor: colors.background },
                    cardCount === n && { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
                  ]}
                >
                  <Text style={[styles.countNum, { color: cardCount === n ? colors.primary : colors.text }]}>{n}</Text>
                  <Text style={[styles.countLabel, { color: colors.muted }]}>cards</Text>
                </Pressable>
              ))}
            </View>

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
});
