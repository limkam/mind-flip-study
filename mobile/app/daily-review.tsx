import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { EmptyState } from "../components/EmptyState";
import { FlashCard } from "../components/FlashCard";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { fetchFlashcardSetsList } from "../lib/flashcardSets";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact, hapticSuccess } from "../lib/haptics";
import { useAuthStore } from "../store/authStore";
import type { DueFlashcardOut } from "../types/api";

const RATING_TO_QUALITY = { hard: 2, medium: 3, easy: 5 } as const;

type ReviewItem = {
  card: { id: string; front: string; back: string };
  setTitle: string;
};

function sortDueRows(rows: DueFlashcardOut[]) {
  return [...rows].sort((a, b) => {
    const da = a.next_review_date ? String(a.next_review_date) : "";
    const db = b.next_review_date ? String(b.next_review_date) : "";
    if (!da && !db) return 0;
    if (!da) return -1;
    if (!db) return 1;
    return da.localeCompare(db);
  });
}

export default function DailyReviewScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Daily Review");
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);

  const { data: reviewItems = [], isLoading } = useQuery({
    queryKey: ["daily-review-queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const sets = await fetchFlashcardSetsList();
      const pages = await Promise.all(
        sets.map((s) =>
          api
            .get<DueFlashcardOut[]>("/study/due-cards", { params: { set_id: s.id, limit: 20 } })
            .then((r) => r.data)
            .catch(() => [] as DueFlashcardOut[]),
        ),
      );
      const merged = sortDueRows(pages.flat());
      return merged.map(
        (row): ReviewItem => ({
          card: { id: row.id, front: row.front, back: row.back },
          setTitle: row.set_title,
        }),
      );
    },
  });

  const count = reviewItems.length;
  const item = reviewItems[currentIdx];

  const rate = useCallback(
    async (rating: keyof typeof RATING_TO_QUALITY) => {
      if (!item) return;
      const quality = RATING_TO_QUALITY[rating];
      await api.post("/study/progress", { card_id: item.card.id, quality });
      await queryClient.invalidateQueries({ queryKey: ["daily-review-queue"] });
      if (rating === "easy") void hapticSuccess();
      else void hapticImpact("medium");
      if (currentIdx >= count - 1) {
        setSessionDone(true);
        return;
      }
      setCurrentIdx((i) => i + 1);
      setFlipped(false);
    },
    [item, currentIdx, count, queryClient],
  );

  const progressLabel = useMemo(
    () => (count ? `${Math.min(currentIdx + 1, count)} / ${count}` : "0 / 0"),
    [currentIdx, count],
  );

  return (
    <Screen>
      {header}
      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading due cards…</Text>
      ) : count === 0 ? (
        <EmptyState
          icon="🧠"
          title="Nothing due today"
          message="You have no flashcards scheduled for review."
        />
      ) : sessionDone ? (
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Session complete</Text>
          <Text style={[styles.doneSub, { color: colors.muted }]}>Nice work — see you tomorrow.</Text>
        </View>
      ) : (
        <View style={styles.session}>
          <View style={styles.topRow}>
            <Text style={[styles.brand, { color: colors.primary }]}>Daily review</Text>
            <Text style={[styles.progress, { color: colors.muted }]}>{progressLabel}</Text>
          </View>
          {item ? (
            <>
              <Text style={[styles.setTitle, { color: colors.muted }]} numberOfLines={1}>
                {item.setTitle}
              </Text>
              <View style={styles.cardArea}>
                <FlashCard
                  key={item.card.id}
                  front={item.card.front}
                  back={item.card.back}
                  onFlippedChange={setFlipped}
                  onSwipeLeft={() => rate("hard")}
                  onSwipeRight={() => rate("easy")}
                />
              </View>
              {flipped ? (
                <Animated.View entering={FadeIn} style={styles.ratingRow}>
                  <RateBtn label="Hard" color={colors.danger} onPress={() => rate("hard")} />
                  <RateBtn label="Good" color={colors.primary} onPress={() => rate("medium")} />
                  <RateBtn label="Easy" color={colors.success} onPress={() => rate("easy")} />
                </Animated.View>
              ) : (
                <Text style={[styles.hint, { color: colors.muted }]}>Tap to flip, then rate your recall</Text>
              )}
              <View style={styles.navRow}>
                <NavBtn
                  label="Previous"
                  disabled={currentIdx === 0}
                  onPress={() => {
                    setCurrentIdx((i) => Math.max(0, i - 1));
                    setFlipped(false);
                  }}
                  colors={colors}
                />
                <NavBtn
                  label="Next"
                  disabled={currentIdx >= count - 1}
                  onPress={() => {
                    setCurrentIdx((i) => Math.min(count - 1, i + 1));
                    setFlipped(false);
                  }}
                  colors={colors}
                />
              </View>
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function RateBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.rateBtn, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.rateBtnText}>{label}</Text>
    </Pressable>
  );
}

function NavBtn({
  label,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  colors: { surface: string; text: string };
}) {
  return (
    <Pressable
      style={[styles.navBtn, { backgroundColor: colors.surface }, disabled && { opacity: 0.35 }]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={{ color: colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center", marginTop: 48, fontSize: 15 },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  doneEmoji: { fontSize: 48, marginBottom: 12 },
  doneTitle: { fontSize: 22, fontWeight: "700" },
  doneSub: { fontSize: 15, marginTop: 8, textAlign: "center" },
  session: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  brand: { fontSize: 14, fontWeight: "700" },
  progress: { fontSize: 13, fontWeight: "600" },
  setTitle: { fontSize: 12, textAlign: "center", marginBottom: 12 },
  cardArea: { flex: 1, justifyContent: "center" },
  hint: { textAlign: "center", fontSize: 14, marginBottom: 12 },
  ratingRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 12 },
  rateBtn: {
    minHeight: 44,
    minWidth: 88,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  rateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  navRow: { flexDirection: "row", justifyContent: "center", gap: 12 },
  navBtn: {
    minHeight: 44,
    minWidth: 110,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
});
