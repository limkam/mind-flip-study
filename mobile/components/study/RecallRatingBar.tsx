import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemeColors } from "../../hooks/useTheme";
import { usePressScale } from "../../hooks/usePressScale";
import { hapticSelection } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

/**
 * `quality` is the SM-2 value posted to `/study/progress` and must not change.
 * It is deliberately never rendered — only `label`, `icon` and `tone` are shown.
 */
export const RECALL_RATINGS = [
  { quality: 1, label: "Again", hint: "I didn't remember this", tone: "danger", icon: "close-circle" },
  { quality: 2, label: "Hard", hint: "I could not recall it correctly", tone: "warning", icon: "alert-circle" },
  { quality: 3, label: "Okay", hint: "I remembered with difficulty", tone: "info", icon: "remove-circle" },
  { quality: 4, label: "Good", hint: "I remembered it", tone: "primary", icon: "checkmark-circle" },
  { quality: 5, label: "Easy", hint: "This felt effortless", tone: "success", icon: "flash" },
] as const;

type RecallRating = (typeof RECALL_RATINGS)[number];
type RatingTone = RecallRating["tone"];

type ToneColors = { accent: string; soft: string; on: string };

function toneColors(tone: RatingTone, colors: ThemeColors): ToneColors {
  switch (tone) {
    case "danger":
      return { accent: colors.danger, soft: colors.dangerSurface, on: colors.onDanger };
    case "warning":
      return { accent: colors.warning, soft: colors.warningSurface, on: colors.onPrimary };
    case "info":
      return { accent: colors.info, soft: colors.infoSurface, on: colors.onPrimary };
    case "success":
      return { accent: colors.success, soft: colors.successSurface, on: colors.onPrimary };
    case "primary":
    default:
      return { accent: colors.primary, soft: colors.primarySoft, on: colors.onPrimary };
  }
}

type Props = {
  onRate: (quality: number) => void;
  qualities?: readonly number[];
  submittingQuality?: number | null;
  disabled?: boolean;
};

export function RecallRatingBar({ onRate, qualities, submittingQuality = null, disabled = false }: Props) {
  const visibleRatings = qualities
    ? RECALL_RATINGS.filter((rating) => qualities.includes(rating.quality))
    : RECALL_RATINGS;
  const { colors } = useTheme();
  const locked = disabled || submittingQuality !== null;

  return (
    <View accessibilityRole="radiogroup" style={styles.wrap}>
      <Text style={[styles.prompt, { color: colors.textSecondary }]}>How well did you remember?</Text>
      <View style={styles.options}>
        {visibleRatings.map((rating) => (
          <RatingTile
            key={rating.quality}
            rating={rating}
            selected={submittingQuality === rating.quality}
            locked={locked}
            onRate={onRate}
          />
        ))}
      </View>
    </View>
  );
}

function RatingTile({
  rating,
  selected,
  locked,
  onRate,
}: {
  rating: RecallRating;
  selected: boolean;
  locked: boolean;
  onRate: (quality: number) => void;
}) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale(0.95);
  const tone = toneColors(rating.tone, colors);
  const foreground = selected ? tone.on : tone.accent;

  return (
    <Animated.View style={[styles.tileWrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={rating.label}
        accessibilityHint={rating.hint}
        accessibilityState={{ disabled: locked, selected }}
        disabled={locked}
        onPressIn={locked ? undefined : onPressIn}
        onPressOut={locked ? undefined : onPressOut}
        onPress={() => {
          void hapticSelection();
          onRate(rating.quality);
        }}
        style={({ pressed }) => [
          styles.tile,
          selected ? TOKENS.elevation.raised : null,
          {
            backgroundColor: selected ? tone.accent : tone.soft,
            borderColor: selected || pressed ? tone.accent : "transparent",
            opacity: locked && !selected ? 0.45 : 1,
          },
        ]}
      >
        <View style={styles.glyph}>
          {selected ? (
            <ActivityIndicator size="small" color={tone.on} />
          ) : (
            <Ionicons name={rating.icon} size={24} color={foreground} />
          )}
        </View>
        <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
          {rating.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", gap: TOKENS.spacing.md },
  prompt: { ...TOKENS.typography.label, textAlign: "center" },
  options: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: TOKENS.spacing.sm,
  },
  tileWrap: { flex: 1 },
  tile: {
    minHeight: 78,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1.5,
    paddingVertical: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: TOKENS.spacing.sm,
  },
  glyph: { height: 24, alignItems: "center", justifyContent: "center" },
  label: { ...TOKENS.typography.label },
});
