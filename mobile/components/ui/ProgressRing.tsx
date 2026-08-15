import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "../../hooks/useTheme";

type Props = {
  /** 0.0 – 1.0 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  progressColor?: string;
  label?: string;
  accessibilityLabel?: string;
};

/** Circular progress indicator. Defaults assume placement on a BrandSurface. */
export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  trackColor,
  progressColor,
  label,
  accessibilityLabel = "Progress",
}: Props) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);
  const track = trackColor ?? `${colors.onBrand}30`;
  const fill = progressColor ?? colors.onBrand;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fill}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="none"
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      {label ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={[styles.labelText, { color: fill }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    position: "absolute",
  },
  labelText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
