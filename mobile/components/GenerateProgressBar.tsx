import { useEffect } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useTheme } from "../hooks/useTheme";
import { generationPhaseLabel } from "../lib/generationPhases";
import { TOKENS } from "../theme/tokens";

type Props = {
  label?: string;
  phase?: string | null;
  chaptersTotal?: number | null;
  chaptersDone?: number | null;
  percentComplete?: number | null;
};

const STEPS = [
  { key: "generating_summary", label: "Summary" },
  { key: "generating_flashcards", label: "Flashcards" },
  { key: "generating_scenarios", label: "Scenarios" },
  { key: "saving_content", label: "Saving" },
];

function stepIndex(phase?: string | null): number {
  const idx = STEPS.findIndex((s) => s.key === phase);
  if (idx >= 0) return idx;
  if (phase === "completed") return STEPS.length;
  if (phase === "extracting_text" || phase === "starting" || phase === "queued") return -1;
  return 0;
}

export function GenerateProgressBar({
  label,
  phase,
  chaptersTotal,
  chaptersDone,
  percentComplete,
}: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const trackW = useSharedValue(240);
  const t = useSharedValue(0);
  const fill = useSharedValue(0);
  const activeIdx = stepIndex(phase);
  const displayLabel = label || generationPhaseLabel(phase);
  const hasPercent = typeof percentComplete === "number" && percentComplete >= 0;

  useEffect(() => {
    if (hasPercent) {
      fill.value = reduceMotion
        ? Math.min(100, percentComplete) / 100
        : withTiming(Math.min(100, percentComplete) / 100, { duration: TOKENS.motion.duration.standard });
      return () => cancelAnimation(fill);
    }
    t.value = 0;
    t.value = reduceMotion
      ? 0.34
      : withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [hasPercent, percentComplete, reduceMotion, t, fill]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) trackW.value = w;
  };

  const knob = useAnimatedStyle(() => {
    if (hasPercent) {
      return { width: trackW.value * fill.value, left: 0 };
    }
    const w = trackW.value;
    const knobW = w * 0.32;
    const maxX = Math.max(0, w - knobW);
    return {
      width: knobW,
      transform: [{ translateX: t.value * maxX }],
    };
  });

  return (
    <View style={styles.wrap}>
      {displayLabel ? <Text style={[styles.label, { color: colors.muted }]}>{displayLabel}</Text> : null}
      <View style={[styles.track, { backgroundColor: colors.skeleton }]} onLayout={onLayout}>
        <Animated.View style={[styles.knob, { backgroundColor: colors.primary }, knob]} />
      </View>
      {chaptersTotal != null && chaptersDone != null ? (
        <Text style={[styles.chapterMeta, { color: colors.muted }]}>
          Chapter {chaptersDone} of {chaptersTotal}
          {hasPercent ? ` · ${percentComplete}% complete` : ""}
        </Text>
      ) : null}
      <View style={styles.steps}>
        {STEPS.map((step, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i || (activeIdx === -1 && i === 0);
          return (
            <Text
              key={step.key}
              style={[
                styles.stepChip,
                { color: colors.muted, borderColor: colors.border },
                done && { color: colors.success, borderColor: `${colors.success}55`, backgroundColor: `${colors.success}12` },
                active && { color: colors.text, borderColor: colors.primary, fontWeight: "700" },
              ]}
            >
              {done ? "✓ " : active ? "• " : ""}
              {step.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginVertical: 8 },
  label: { fontSize: 13, marginBottom: 8 },
  chapterMeta: { fontSize: 11, marginTop: 6, fontWeight: "600" },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    width: "100%",
  },
  knob: {
    height: "100%",
    borderRadius: 999,
    position: "absolute",
    left: 0,
    top: 0,
  },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  stepChip: {
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
