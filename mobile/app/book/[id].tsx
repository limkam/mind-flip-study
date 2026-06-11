import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
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
import { generationPhaseLabel } from "../../lib/generationPhases";
import { chapterSelectionSubtitle } from "../../lib/studySetDisplay";
import { useGenerationJobStore } from "../../store/generationJobStore";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import type { BookOut } from "../../types/api";

const COUNTS = [20, 50, 100] as const;

export default function BookByIdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const startJob = useGenerationJobStore((s) => s.startJob);
  const activeBookJob = useGenerationJobStore((s) => (id ? s.getBookJob(id) : undefined));

  const [cardCount, setCardCount] = useState<(typeof COUNTS)[number]>(20);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({});
  const [genError, setGenError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const { data: book, isLoading, isError, refetch } = useQuery({
    queryKey: ["book", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<BookOut>(`/books/${id}`);
      return data;
    },
  });

  const chapters = book?.table_of_contents ?? [];
  const tocKey = JSON.stringify(book?.table_of_contents ?? null);

  useEffect(() => {
    if (!book?.id) return;
    const toc = book.table_of_contents ?? [];
    if (toc.length > 0) {
      const titles = toc
        .map((c) => c.title)
        .filter((t): t is string => !!t && String(t).trim().length > 0);
      setSelectedChapters(titles);
    } else {
      setSelectedChapters([]);
    }
  }, [book?.id, tocKey]);

  const toggleChapter = (title: string) => {
    setSelectedChapters((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));
  };

  const selectAll = () => {
    if (!chapters.length) return;
    const all = chapters.map((ch, i) => ch.title ?? `Chapter ${i + 1}`);
    setSelectedChapters((prev) => (prev.length === all.length ? [] : all));
  };

  const toggleExpand = (idx: number) => {
    setExpandedChapters((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const startGenerate = async () => {
    if (!book || !id) return;
    if (chapters.length > 0 && selectedChapters.length === 0) {
      setGenError("Select at least one chapter.");
      return;
    }
    setGenError(null);
    setStarting(true);
    try {
      const { data: job } = await api.post<{ job_id: string }>("/flashcard-sets/generate", {
        book_id: book.id,
        title: book.title,
        num_cards: cardCount,
        selected_chapters: selectedChapters,
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
  const canGenerate = !isGenerating && !(chapters.length > 0 && selectedChapters.length === 0);

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
            {chapters.length} chapter{chapters.length !== 1 ? "s" : ""} extracted
          </Text>
          {book.description ? (
            <Text style={[styles.body, { color: colors.text }]}>{book.description}</Text>
          ) : null}

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Table of contents</Text>
                <Text style={[styles.sectionSub, { color: colors.muted }]}>
                  Select chapters to generate flashcards from
                </Text>
              </View>
              {chapters.length > 0 ? (
                <Pressable
                  onPress={() => {
                    void hapticImpact("light");
                    selectAll();
                  }}
                  style={[styles.linkBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.linkBtnText, { color: colors.primary }]}>
                    {selectedChapters.length === chapters.length ? "Deselect all" : "Select all"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {chapters.length === 0 ? (
              <Text style={[styles.emptyToc, { color: colors.muted }]}>
                No table of contents extracted yet. Try re-uploading the book with a PDF that has a clear TOC.
              </Text>
            ) : (
              chapters.map((chapter, idx) => {
                const t = chapter.title ?? `Chapter ${idx + 1}`;
                const on = selectedChapters.includes(t);
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
                    <Pressable style={styles.chapterRow} onPress={() => toggleChapter(t)}>
                      <View style={[styles.chBox, { borderColor: on ? colors.primary : colors.border }, on && { backgroundColor: `${colors.primary}20` }]}>
                        {on ? <Text style={[styles.chMark, { color: colors.primary }]}>✓</Text> : null}
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
            {selectedChapters.length > 0 ? (
              <>
                <Text style={[styles.sectionSub, { color: colors.primary, fontWeight: "600" }]}>
                  {chapterSelectionSubtitle(selectedChapters.length)}
                </Text>
                <SelectedChaptersList chapters={selectedChapters} />
              </>
            ) : (
              <Text style={[styles.sectionSub, { color: colors.muted, marginBottom: 12 }]}>
                Select chapters above to generate flashcards
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
  emptyToc: { fontSize: 14, lineHeight: 20, textAlign: "center", paddingVertical: 16 },
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
  chMark: { fontSize: 12, fontWeight: "800" },
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
  countRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
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
