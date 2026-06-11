import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GenerateProgressBar } from "./GenerateProgressBar";
import { generationPhaseLabel } from "../lib/generationPhases";
import { useGenerationJobStore } from "../store/generationJobStore";
import { useTheme } from "../hooks/useTheme";

export function GenerationStatusBanner() {
  const jobs = useGenerationJobStore((s) => s.jobs);
  const removeJob = useGenerationJobStore((s) => s.removeJob);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const active = jobs[0];

  if (!active) return null;

  const chapterLine =
    active.chaptersTotal != null && active.chaptersDone != null
      ? `Chapter ${active.chaptersDone} of ${active.chaptersTotal}`
      : null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: `${colors.primary}44`,
          bottom: Math.max(insets.bottom, 8) + 56,
        },
      ]}
    >
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Generating flashcards…</Text>
          <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
            {active.bookTitle}
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            This may take a few moments. You may continue using MindFlip while generation completes.
          </Text>
        </View>
        <Pressable onPress={() => removeJob(active.jobId)} hitSlop={8}>
          <Text style={[styles.dismiss, { color: colors.muted }]}>✕</Text>
        </Pressable>
      </View>

      <GenerateProgressBar
        phase={active.phase}
        label={generationPhaseLabel(active.phase)}
        chaptersTotal={active.chaptersTotal}
        chaptersDone={active.chaptersDone}
        percentComplete={active.percentComplete}
      />

      {chapterLine || active.percentComplete != null ? (
        <View style={styles.metaRow}>
          {chapterLine ? <Text style={[styles.meta, { color: colors.muted }]}>{chapterLine}</Text> : <View />}
          {active.percentComplete != null ? (
            <Text style={[styles.meta, { color: colors.primary }]}>{active.percentComplete}% complete</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable onPress={() => router.push(`/book/${active.bookId}`)}>
        <Text style={[styles.link, { color: colors.primary }]}>View book details</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  head: { flexDirection: "row", gap: 8, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  dismiss: { fontSize: 18, padding: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  meta: { fontSize: 11, fontWeight: "600" },
  link: { fontSize: 12, fontWeight: "700", marginTop: 8 },
});
