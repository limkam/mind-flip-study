import { useEffect } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { generationPhaseLabel } from "../lib/generationPhases";

type Props = {
  label?: string;
  phase?: string | null;
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

export function GenerateProgressBar({ label, phase }: Props) {
  const trackW = useSharedValue(240);
  const t = useSharedValue(0);
  const activeIdx = stepIndex(phase);
  const displayLabel = label || generationPhaseLabel(phase);

  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, false);
  }, [t]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) trackW.value = w;
  };

  const knob = useAnimatedStyle(() => {
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
      {displayLabel ? <Text style={styles.label}>{displayLabel}</Text> : null}
      <View style={styles.track} onLayout={onLayout}>
        <Animated.View style={[styles.knob, knob]} />
      </View>
      <View style={styles.steps}>
        {STEPS.map((step, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i || (activeIdx === -1 && i === 0);
          return (
            <Text
              key={step.key}
              style={[
                styles.stepChip,
                done && styles.stepDone,
                active && styles.stepActive,
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
  label: { fontSize: 13, color: "#64748b", marginBottom: 8 },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
    width: "100%",
  },
  knob: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0d9488",
    position: "absolute",
    left: 0,
    top: 0,
  },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  stepChip: {
    fontSize: 11,
    color: "#94a3b8",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepDone: { color: "#0d9488", borderColor: "#99f6e4", backgroundColor: "#f0fdfa" },
  stepActive: { color: "#0f172a", borderColor: "#5eead4", fontWeight: "700" },
});
