import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticSelection } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

export type SegmentedOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Premium segmented control — tonal track, elevated selected pill. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, style }: Props<T>) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }, style]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (selected) return;
              void hapticSelection();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              selected
                ? { backgroundColor: colors.surfaceElevated, ...TOKENS.elevation.raised }
                : pressed
                  ? { backgroundColor: colors.surface }
                  : null,
            ]}
          >
            <Text
              style={[styles.label, { color: selected ? colors.primary : colors.textSecondary }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: TOKENS.radii.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: TOKENS.radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: TOKENS.spacing.sm,
  },
  label: {
    fontSize: TOKENS.typography.label.fontSize,
    fontWeight: TOKENS.typography.label.fontWeight,
  },
});
