import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  totalCards: number;
  avgQuality: number;
  onRetry: () => void;
  onDone: () => void;
};

export function SummaryView({ totalCards, avgQuality, onRetry, onDone }: Props) {
  const { colors } = useTheme();
  const progress = useSharedValue(CIRCUMFERENCE);

  useEffect(() => {
    const filled = CIRCUMFERENCE * (Math.min(avgQuality, 5) / 5);
    progress.value = withTiming(CIRCUMFERENCE - filled, { duration: 900 });
  }, [avgQuality, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.ringWrap}>
        <Svg width={150} height={150}>
          <Circle
            cx={75}
            cy={75}
            r={RADIUS}
            stroke={colors.border}
            strokeWidth={10}
            fill="none"
          />
          <AnimatedCircle
            cx={75}
            cy={75}
            r={RADIUS}
            stroke={colors.primary}
            strokeWidth={10}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin="75, 75"
          />
        </Svg>
        <Text style={[styles.ringLabel, { color: colors.text }]}>
          {avgQuality.toFixed(1)}
          <Text style={{ fontSize: 14, color: colors.muted }}>/5</Text>
        </Text>
      </View>

      <Text style={[styles.title, { color: colors.text }]}>Session complete!</Text>
      <Text style={[styles.stat, { color: colors.muted }]}>Cards reviewed: {totalCards}</Text>
      <Text style={[styles.stat, { color: colors.muted }]}>Avg quality: {avgQuality.toFixed(1)}/5</Text>

      <Pressable
        style={[styles.btn, { backgroundColor: colors.primary }]}
        onPress={() => {
          void hapticImpact("light");
          onRetry();
        }}
      >
        <Text style={styles.btnText}>Study again</Text>
      </Pressable>
      <Pressable
        style={[styles.btnOutline, { borderColor: colors.border }]}
        onPress={() => {
          void hapticImpact("light");
          onDone();
        }}
      >
        <Text style={[styles.btnOutlineText, { color: colors.text }]}>Back to library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 16 },
  ringWrap: { width: 150, height: 150, alignItems: "center", justifyContent: "center" },
  ringLabel: {
    position: "absolute",
    fontSize: 28,
    fontWeight: "800",
  },
  title: { fontSize: 22, fontWeight: "800", marginTop: 16 },
  stat: { fontSize: 15, marginTop: 6 },
  btn: {
    marginTop: 24,
    minHeight: 44,
    minWidth: 200,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  btnOutline: {
    marginTop: 12,
    minHeight: 44,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  btnOutlineText: { fontWeight: "600", fontSize: 16 },
});
