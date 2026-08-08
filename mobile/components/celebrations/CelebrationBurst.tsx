import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { TOKENS } from "../../theme/tokens";

const PARTICLES = [
  { x: -72, y: -52, color: "primary" }, { x: -38, y: -82, color: "xp" },
  { x: 4, y: -92, color: "success" }, { x: 48, y: -76, color: "streak" },
  { x: 78, y: -42, color: "primary" }, { x: -82, y: -8, color: "success" },
  { x: 82, y: 4, color: "xp" }, { x: -56, y: 38, color: "streak" },
] as const;

type Props = { eventId: string; colors: Record<"primary" | "xp" | "success" | "streak", string> };

export function CelebrationBurst({ eventId, colors }: Props) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: TOKENS.motion.duration.deliberate });
  }, [eventId, progress]);
  const animated = useAnimatedStyle(() => ({ opacity: 1 - progress.value, transform: [{ scale: 0.7 + progress.value * 0.3 }] }));

  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.layer, animated]}>{PARTICLES.map((particle, index) => <View key={`${particle.x}:${particle.y}`} style={[styles.particle, { backgroundColor: colors[particle.color], transform: [{ translateX: particle.x }, { translateY: particle.y }, { rotate: `${index * 22}deg` }] }]} />)}</Animated.View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  particle: { position: "absolute", width: 8, height: 16, borderRadius: 3 },
});
