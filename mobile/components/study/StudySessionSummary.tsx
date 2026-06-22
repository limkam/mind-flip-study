import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";

export type SessionStats = {
  total?: number;
  hard?: number;
  medium?: number;
  easy?: number;
  durationMs?: number;
  completionRate?: number;
  confidenceScore?: number;
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
  const accuracy = total > 0 ? Math.round(((easy + medium) / total) * 100) : 0;
  const mins = Math.max(1, Math.round((stats.durationMs ?? 0) / 60000));

  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{mode === "games" ? "⚡" : "🎯"}</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        {mode === "games" ? "Game Session Complete!" : "Session Complete!"}
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {mode === "games"
          ? "Great work — keep the streak going!"
          : "Your ratings power spaced repetition."}
      </Text>

      <View style={styles.grid}>
        <StatCard label="Cards Reviewed" value={String(total)} colors={colors} />
        <StatCard label="Time Spent" value={`${mins} min`} colors={colors} />
        <StatCard label="Hard" value={String(hard)} colors={colors} valueColor={colors.danger} />
        <StatCard label="OK" value={String(medium)} colors={colors} valueColor={colors.warning} />
        <StatCard label="Easy" value={String(easy)} colors={colors} valueColor={colors.success} />
        <StatCard label="Accuracy" value={`${accuracy}%`} colors={colors} />
      </View>

      {hard > 0 && onReviewHard ? (
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("medium");
            onReviewHard();
          }}
        >
          <Text style={styles.primaryBtnText}>Practice Hard Cards Again</Text>
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
        <Text style={[styles.ghostText, { color: colors.muted }]}>Return to Dashboard</Text>
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
  wrap: { padding: 20, alignItems: "center" },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, marginTop: 6, marginBottom: 20, textAlign: "center", lineHeight: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
    marginBottom: 20,
  },
  statCard: {
    width: "47%",
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
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
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
