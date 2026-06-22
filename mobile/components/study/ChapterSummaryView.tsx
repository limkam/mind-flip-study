import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { buildEnhancedSummaryPrompt, formatSummaryScope } from "../../lib/summaryScope";
import { SummaryCard, type ChapterSummary } from "./SummaryCard";

type Card = {
  front: string;
  back: string;
  chapter?: string | null;
  difficulty?: string | null;
};

type Props = {
  cards: Card[];
  bookTitle?: string | null;
  selectedChapters?: string[];
};

export function ChapterSummaryView({ cards, bookTitle, selectedChapters = [] }: Props) {
  const { colors } = useTheme();
  const [summaries, setSummaries] = useState<ChapterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopedCards =
    selectedChapters.length > 0
      ? cards.filter((c) => c.chapter && selectedChapters.includes(c.chapter))
      : cards;

  const scopeLabel = formatSummaryScope(selectedChapters, bookTitle ?? "");

  const generateSummaries = async () => {
    if (!scopedCards.length) return;
    setLoading(true);
    setError(null);
    setGenerated(false);

    const byChapter: Record<string, Card[]> = {};
    scopedCards.forEach((card) => {
      const ch = card.chapter || "General";
      if (!byChapter[ch]) byChapter[ch] = [];
      byChapter[ch].push(card);
    });

    const chapterList = Object.entries(byChapter).map(([chapter, chCards]) => ({
      chapter,
      cardCount: chCards.length,
      qa: chCards.map((c) => `Q: ${c.front}\nA: ${c.back}`).join("\n\n"),
    }));

    try {
      const { data: result } = await api.post<{ chapters?: ChapterSummary[] }>("/ai/invoke", {
        prompt: buildEnhancedSummaryPrompt({
          bookTitle: bookTitle ?? "this book",
          chapterList,
          detailLevel: "standard",
        }),
        response_json_schema: {
          type: "object",
          properties: {
            chapters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chapter: { type: "string" },
                  overview: { type: "string" },
                  core_concept: { type: "string" },
                  key_points: { type: "array", items: { type: "string" } },
                  common_mistakes: { type: "array", items: { type: "string" } },
                  difficulty: { type: "string" },
                },
              },
            },
          },
        },
      });

      setSummaries(result.chapters ?? []);
      setGenerated(true);
    } catch {
      setError("Could not generate summaries. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!scopedCards.length && selectedChapters.length > 0) {
    return (
      <View style={styles.center}>
        <Text style={[styles.empty, { color: colors.muted }]}>No cards for the selected chapter scope.</Text>
      </View>
    );
  }

  if (!scopedCards.length) {
    return (
      <View style={styles.center}>
        <Text style={[styles.empty, { color: colors.muted }]}>No flashcards in this set yet.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.scopeBox, { backgroundColor: `${colors.primary}11`, borderColor: `${colors.primary}33` }]}>
        <Text style={[styles.scopeLabel, { color: colors.muted }]}>SUMMARY SCOPE</Text>
        <Text style={[styles.scopeValue, { color: colors.text }]}>{scopeLabel}</Text>
      </View>

      {!generated && !loading ? (
        <View style={[styles.prompt, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.promptEmoji}>📖</Text>
          <Text style={[styles.promptTitle, { color: colors.text }]}>Enhanced summaries</Text>
          <Text style={[styles.promptSub, { color: colors.muted }]}>
            Generate AI-powered overviews from your flashcards. Detail level is chosen when you generate flashcards from the book page.
          </Text>
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => {
              void hapticImpact("light");
              void generateSummaries();
            }}
          >
            <Text style={styles.btnText}>Generate summaries</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={[styles.prompt, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.promptTitle, { color: colors.text, marginTop: 16 }]}>Crafting summaries…</Text>
        </View>
      ) : null}

      {generated ? (
        <View>
          <View style={styles.toolbar}>
            <Text style={[styles.count, { color: colors.muted }]}>
              {summaries.length} chapter{summaries.length !== 1 ? "s" : ""} summarized
            </Text>
            <Pressable
              onPress={() => {
                void hapticImpact("light");
                void generateSummaries();
              }}
            >
              <Text style={[styles.regen, { color: colors.primary }]}>Regenerate</Text>
            </Pressable>
          </View>
          {summaries.map((s, i) => (
            <SummaryCard key={`${s.chapter}-${i}`} {...s} defaultOpen={i === 0} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 32, alignItems: "center" },
  empty: { fontSize: 15, textAlign: "center" },
  scopeBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  scopeLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginBottom: 4 },
  scopeValue: { fontSize: 14, fontWeight: "600" },
  prompt: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 12,
  },
  promptEmoji: { fontSize: 40, marginBottom: 12 },
  promptTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  promptSub: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 16 },
  error: { fontSize: 13, marginBottom: 12, textAlign: "center" },
  btn: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  count: { fontSize: 13, fontWeight: "600" },
  regen: { fontSize: 14, fontWeight: "700" },
});
