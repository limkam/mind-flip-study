import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";

type Props = {
  front: string;
  back: string;
  difficulty?: string | null;
  chapter?: string | null;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onFlippedChange?: (flipped: boolean) => void;
};

export function FlashCard({
  front,
  back,
  difficulty,
  chapter,
  onSwipeLeft,
  onSwipeRight,
  onFlippedChange,
}: Props) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const isFlipped = useSharedValue(false);

  const notifyFlip = useCallback(
    (flipped: boolean) => {
      onFlippedChange?.(flipped);
      void hapticImpact("light");
    },
    [onFlippedChange],
  );

  const tapGesture = Gesture.Tap().onEnd(() => {
    "worklet";
    isFlipped.value = !isFlipped.value;
    rotation.value = withTiming(isFlipped.value ? 180 : 0, { duration: 300 });
    runOnJS(notifyFlip)(isFlipped.value);
  });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .onUpdate((e) => {
      "worklet";
      if (isFlipped.value) translateX.value = e.translationX;
    })
    .onEnd((e) => {
      "worklet";
      if (!isFlipped.value) return;
      if (e.translationX < -80) {
        runOnJS(onSwipeLeft)();
      } else if (e.translationX > 80) {
        runOnJS(onSwipeRight)();
      }
      translateX.value = withTiming(0);
    });

  const composed = Gesture.Simultaneous(tapGesture, panGesture);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotateY: `${interpolate(rotation.value, [0, 180], [0, 180], Extrapolation.CLAMP)}deg`,
      },
    ],
    backfaceVisibility: "hidden" as const,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotateY: `${interpolate(rotation.value, [0, 180], [180, 360], Extrapolation.CLAMP)}deg`,
      },
    ],
    backfaceVisibility: "hidden" as const,
  }));

  const diffColor =
    difficulty === "easy"
      ? colors.success
      : difficulty === "hard"
        ? colors.danger
        : colors.warning;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={styles.container}>
        <Animated.View
          style={[
            styles.face,
            frontStyle,
            { backgroundColor: colors.cardFront, borderColor: colors.border },
          ]}
        >
          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <Text style={styles.headerLabel}>Question</Text>
            {chapter ? <Text style={styles.chapter} numberOfLines={1}>{chapter}</Text> : null}
          </View>
          <View style={styles.body}>
            <Text style={[styles.cardText, { color: colors.text }]}>{front}</Text>
          </View>
          {difficulty ? (
            <Text style={[styles.badge, { color: diffColor, borderColor: diffColor }]}>{difficulty}</Text>
          ) : null}
          <Text style={[styles.hint, { color: colors.muted }]}>Tap to reveal</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            styles.backFace,
            backStyle,
            { backgroundColor: colors.cardBack, borderColor: colors.border },
          ]}
        >
          <View style={[styles.header, { backgroundColor: colors.success }]}>
            <Text style={styles.headerLabel}>Answer</Text>
          </View>
          <View style={styles.body}>
            <Text style={[styles.cardText, { color: colors.text }]}>{back}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>Swipe ← Again · Swipe → Easy</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: 280,
    position: "relative",
  },
  face: {
    position: "absolute",
    width: "100%",
    minHeight: 280,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  backFace: {},
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  chapter: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    maxWidth: 140,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    minHeight: 180,
  },
  cardText: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 28,
  },
  badge: {
    alignSelf: "center",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  hint: {
    textAlign: "center",
    fontSize: 13,
    paddingBottom: 14,
  },
});
