import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import type { QuizResultOut } from "../../types/api";

type QuizAnswer = {
  question?: string;
  user_answer?: string;
  correct_answer?: string;
  is_correct?: boolean;
  explanation?: string;
  chapter?: string;
};

function formatTime(secs: number | null | undefined) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function QuizResultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const { data: result, isLoading, isError } = useQuery({
    queryKey: ["quiz-result", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<QuizResultOut>(`/quiz-results/${id}`);
      return data;
    },
  });

  const analysis = useMemo(() => {
    const answers = (result?.extras?.answers ?? []) as QuizAnswer[];
    const byChapter: Record<string, { correct: number; total: number }> = {};
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
    return {
      strong: chapters.filter((c) => c.pct >= 80).map((c) => c.chapter),
      weak: chapters.filter((c) => c.pct < 60).map((c) => c.chapter),
    };
  }, [result]);

  const answers = (result?.extras?.answers ?? []) as QuizAnswer[];
  const pct = Math.round(result?.percentage ?? 0);

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: "Quiz Result" }} />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : isError || !result ? (
        <View style={styles.center}>
          <Text style={{ color: colors.muted }}>Result not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
          <Pressable
            onPress={() => {
              void hapticImpact("light");
              router.back();
            }}
            style={{ marginBottom: 12 }}
          >
            <Text style={{ color: colors.muted, fontWeight: "600" }}>← Back</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.trophy}>🏆</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.setTitle, { color: colors.text }]} numberOfLines={2}>
                {result.extras?.set_title ?? result.set_title ?? "Quiz Result"}
              </Text>
              {result.extras?.book_title || result.book_title ? (
                <Text style={[styles.bookTitle, { color: colors.muted }]} numberOfLines={1}>
                  {result.extras?.book_title ?? result.book_title}
                </Text>
              ) : null}
              <View style={styles.scoreRow}>
                <Text style={[styles.pct, { color: colors.primary }]}>{pct}%</Text>
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {result.score}/{result.total_questions} correct · {formatTime(result.time_taken_seconds)}
                </Text>
              </View>
            </View>
          </View>

          {(analysis.strong.length > 0 || analysis.weak.length > 0) && (
            <View style={styles.analysisRow}>
              {analysis.strong.length > 0 && (
                <View style={[styles.analysisBox, { borderColor: `${colors.success}44`, backgroundColor: `${colors.success}11` }]}>
                  <Text style={[styles.analysisLabel, { color: colors.success }]}>Strong Chapters</Text>
                  <Text style={[styles.chipText, { color: colors.text }]}>{analysis.strong.join(", ")}</Text>
                </View>
              )}
              {analysis.weak.length > 0 && (
                <View style={[styles.analysisBox, { borderColor: `${colors.danger}44`, backgroundColor: `${colors.danger}11` }]}>
                  <Text style={[styles.analysisLabel, { color: colors.danger }]}>Recommended Review</Text>
                  <Text style={[styles.chipText, { color: colors.text }]}>{analysis.weak.join(", ")}</Text>
                </View>
              )}
            </View>
          )}

          {answers.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Question Breakdown</Text>
              {answers.map((a, i) => (
                <View
                  key={i}
                  style={[
                    styles.answerCard,
                    {
                      borderColor: a.is_correct ? `${colors.success}44` : `${colors.danger}44`,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.question, { color: colors.text }]}>
                    {a.is_correct ? "✓ " : "✗ "}
                    {a.question}
                  </Text>
                  {!a.is_correct && a.user_answer ? (
                    <Text style={[styles.answerLine, { color: colors.muted }]}>
                      Your answer: <Text style={{ color: colors.danger }}>{a.user_answer}</Text>
                    </Text>
                  ) : null}
                  {a.correct_answer ? (
                    <Text style={[styles.answerLine, { color: colors.muted }]}>
                      Correct: <Text style={{ color: colors.success }}>{a.correct_answer}</Text>
                    </Text>
                  ) : null}
                  {a.explanation ? (
                    <Text style={[styles.explanation, { color: colors.muted }]}>{a.explanation}</Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            <Text style={[styles.noBreakdown, { color: colors.muted }]}>
              No per-question breakdown available for this result.
            </Text>
          )}

          {result.set_id ? (
            <Pressable
              style={[styles.linkBtn, { borderColor: colors.border }]}
              onPress={() => {
                void hapticImpact("light");
                router.push(`/study/${result.set_id}`);
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "600" }}>Back to Flashcard Set</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  center: { padding: 32, alignItems: "center" },
  header: { flexDirection: "row", gap: 14, marginBottom: 20 },
  trophy: { fontSize: 40 },
  setTitle: { fontSize: 20, fontWeight: "800" },
  bookTitle: { fontSize: 13, marginTop: 4 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  pct: { fontSize: 24, fontWeight: "800" },
  meta: { fontSize: 13 },
  analysisRow: { gap: 10, marginBottom: 16 },
  analysisBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  analysisLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  chipText: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  answerCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  question: { fontSize: 14, fontWeight: "600", lineHeight: 20, marginBottom: 8 },
  answerLine: { fontSize: 12, marginBottom: 4, lineHeight: 18 },
  explanation: { fontSize: 12, fontStyle: "italic", marginTop: 4, lineHeight: 17 },
  noBreakdown: { fontSize: 14, marginBottom: 16 },
  linkBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
