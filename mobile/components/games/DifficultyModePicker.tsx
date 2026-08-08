import { Pressable, StyleSheet, Text, View } from "react-native";

import { difficultyLabel, QUIZ_DIFFICULTY_MODES, type QuizDifficultyMode } from "../../lib/gameUtils";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

type Props = {
  value: QuizDifficultyMode;
  onChange: (mode: QuizDifficultyMode) => void;
  disabled?: boolean;
};

export function DifficultyModePicker({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();

  return (
    <View accessibilityRole="radiogroup"><Text style={[styles.label, { color: colors.textSecondary }]}>Difficulty</Text><View style={styles.row}>
      {QUIZ_DIFFICULTY_MODES.map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: !!disabled }}
            onPress={() => {
              void hapticImpact("light");
              onChange(mode);
            }}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.surface },
              active && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
              disabled && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? colors.primary : colors.muted }]}>
              {difficultyLabel(mode)}
            </Text>
          </Pressable>
        );
      })}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...TOKENS.typography.label, marginBottom: TOKENS.spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.lg },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  chipText: { ...TOKENS.typography.label },
});
