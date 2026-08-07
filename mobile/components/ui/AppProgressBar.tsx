import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

type Props = {
  progress: number; // Value from 0.0 to 1.0
  color?: string;
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppProgressBar({
  progress,
  color,
  height = 8,
  accessibilityLabel = "Progress",
  style,
}: Props) {
  const { colors } = useTheme();

  const clamped = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clamped * 100);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
      style={[
        styles.track,
        {
          height,
          backgroundColor: colors.surfaceMuted,
          borderRadius: height / 2,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${percentage}%`,
            backgroundColor: color ?? colors.primary,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});
