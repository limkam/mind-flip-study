import { useEffect } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

type Props = {
  label?: string;
};

export function GenerateProgressBar({ label = "Working…" }: Props) {
  const trackW = useSharedValue(240);
  const t = useSharedValue(0);

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
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.track} onLayout={onLayout}>
        <Animated.View style={[styles.knob, knob]} />
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
});
