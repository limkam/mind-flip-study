import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

export const RECALL_RATINGS = [
  { quality: 1, label: "Again", hint: "I didn't remember this" },
  { quality: 2, label: "Hard", hint: "I could not recall it correctly" },
  { quality: 3, label: "Okay", hint: "I remembered with difficulty" },
  { quality: 4, label: "Good", hint: "I remembered it" },
  { quality: 5, label: "Easy", hint: "This felt effortless" },
] as const;

type Props = {
  onRate: (quality: number) => void;
  qualities?: readonly number[];
  submittingQuality?: number | null;
  disabled?: boolean;
};

export function RecallRatingBar({ onRate, qualities, submittingQuality = null, disabled = false }: Props) {
  const { colors } = useTheme();
  const visibleRatings = qualities
    ? RECALL_RATINGS.filter((rating) => qualities.includes(rating.quality))
    : RECALL_RATINGS;

  return (
    <View accessibilityRole="radiogroup" style={styles.wrap}>
      <Text style={[styles.prompt, { color: colors.text }]}>How well did you remember?</Text>
      <View style={styles.options}>
        {visibleRatings.map((rating) => {
          const selected = submittingQuality === rating.quality;
          return (
            <Pressable
              key={rating.quality}
              accessibilityRole="button"
              accessibilityLabel={`Recall rating ${rating.quality}, ${rating.label}`}
              accessibilityHint={rating.hint}
              accessibilityState={{ disabled: disabled || submittingQuality !== null, selected }}
              disabled={disabled || submittingQuality !== null}
              onPress={() => onRate(rating.quality)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected
                    ? colors.primary
                    : pressed
                      ? colors.primarySoft
                      : colors.surfaceElevated,
                  borderColor: selected ? colors.primary : colors.borderStrong,
                  opacity: disabled && !selected ? 0.5 : 1,
                },
              ]}
            >
              {selected ? <ActivityIndicator size="small" color={colors.onPrimary} /> : (
                <Text style={[styles.number, { color: colors.textMuted }]}>{rating.quality}</Text>
              )}
              <Text style={[styles.label, { color: selected ? colors.onPrimary : colors.text }]}>
                {rating.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", gap: TOKENS.spacing.sm },
  prompt: { ...TOKENS.typography.label, textAlign: "center" },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: TOKENS.spacing.sm,
  },
  option: {
    width: "30%",
    minWidth: 88,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: TOKENS.radii.md,
    paddingHorizontal: TOKENS.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: TOKENS.spacing.xs,
  },
  number: { ...TOKENS.typography.caption },
  label: { ...TOKENS.typography.label },
});
