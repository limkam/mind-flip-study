import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";
import { RECALL_RATINGS } from "./RecallRatingBar";

export type RatingCounts = Partial<Record<1 | 2 | 3 | 4 | 5, number>>;

export type SessionStats = {
  total?: number;
  hard?: number;
  medium?: number;
  easy?: number;
  ratingCounts?: RatingCounts;
  queuedOfflineCount?: number;
};

type Props = {
  stats: SessionStats;
  mode?: "study" | "games";
  onReviewHard?: (() => void) | null;
  onContinue?: (() => void) | null;
  onGenerateQuiz?: (() => void) | null;
};

export function StudySessionSummary({
  stats,
  mode = "study",
  onReviewHard,
  onContinue,
  onGenerateQuiz,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const total = stats.total ?? 0;
  const hard = stats.hard ?? 0;
  const medium = stats.medium ?? 0;
  const easy = stats.easy ?? 0;
  const ratingCounts = stats.ratingCounts;
  const queuedOfflineCount = stats.queuedOfflineCount ?? 0;
  useEffect(() => {
    const syncNote = queuedOfflineCount > 0 ? ` ${queuedOfflineCount} ratings saved for sync.` : "";
    AccessibilityInfo.announceForAccessibility(`Session complete. ${total} cards reviewed.${syncNote}`);
  }, [queuedOfflineCount, total]);
  return (
    <View style={styles.wrap}>
      <View style={[styles.completionIcon, { backgroundColor: colors.primarySoft }]} accessible={false}><Ionicons name={mode === "games" ? "flash" : "checkmark-circle"} size={38} color={colors.primary} /></View>
      <Text style={[styles.title, { color: colors.text }]}>
        {mode === "games" ? "Game session complete" : "Session complete"}
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {mode === "games"
          ? "Great work — keep going when you're ready."
          : queuedOfflineCount > 0
            ? `${total} card${total === 1 ? "" : "s"} reviewed. ${queuedOfflineCount} rating${queuedOfflineCount === 1 ? " is" : "s are"} saved for sync.`
            : `${total} card${total === 1 ? "" : "s"} reviewed.`}
      </Text>

      <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.statLabel, { color: colors.muted }]}>Cards reviewed</Text>
        <Text style={[styles.statValue, { color: colors.text }]}>{total}</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Your recall ratings</Text>
      <View style={styles.grid}>
        {ratingCounts ? RECALL_RATINGS.map((rating) => (
          <StatCard
            key={rating.quality}
            label={rating.label}
            value={String(ratingCounts[rating.quality] ?? 0)}
            colors={colors}
          />
        )) : (
          <>
            <StatCard label="Hard" value={String(hard)} colors={colors} />
            <StatCard label="Okay / Good" value={String(medium)} colors={colors} />
            <StatCard label="Easy" value={String(easy)} colors={colors} />
          </>
        )}
      </View>

      {hard > 0 && onReviewHard ? (
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("medium");
            onReviewHard();
          }}
        >
          <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Practice Hard Cards Again</Text>
        </Pressable>
      ) : null}

      {onContinue ? (
        <Pressable
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
          onPress={() => {
            void hapticImpact("light");
            onContinue();
          }}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Continue Studying</Text>
        </Pressable>
      ) : null}

      {onGenerateQuiz ? (
        <Pressable
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
          onPress={() => {
            void hapticImpact("light");
            onGenerateQuiz();
          }}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Generate Quiz</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.ghostBtn}
        onPress={() => {
          void hapticImpact("light");
          router.replace("/(tabs)");
        }}
      >
        <Text style={[styles.ghostText, { color: colors.muted }]}>Return Home</Text>
      </Pressable>
    </View>
  );
}

function StatCard({
  label,
  value,
  colors,
  valueColor,
}: {
  label: string;
  value: string;
  colors: { surface: string; border: string; text: string; muted: string };
  valueColor?: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor ?? colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: TOKENS.spacing.xl, alignItems: "center", width: "100%", maxWidth: 560, alignSelf: "center" },
  completionIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: TOKENS.spacing.md },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, marginTop: 6, marginBottom: 20, textAlign: "center", lineHeight: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
    marginBottom: 20,
  },
  totalCard: { width: "100%", borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionLabel: { ...TOKENS.typography.label, alignSelf: "flex-start", marginBottom: 10 },
  statCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  statLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: "800" },
  primaryBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: { fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryBtnText: { fontWeight: "600", fontSize: 15 },
  ghostBtn: { paddingVertical: 12 },
  ghostText: { fontSize: 14, fontWeight: "600" },
});
