import { Pressable, StyleSheet, Text, View } from "react-native";

import { difficultyLabel, QUIZ_DIFFICULTY_MODES, type QuizDifficultyMode } from "../../lib/gameUtils";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";

type Props = {
  value: QuizDifficultyMode;
  onChange: (mode: QuizDifficultyMode) => void;
  disabled?: boolean;
};

export function DifficultyModePicker({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {QUIZ_DIFFICULTY_MODES.map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            disabled={disabled}
            onPress={() => {
              void hapticImpact("light");
              onChange(mode);
            }}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.background },
              active && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
              disabled && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? colors.primary : colors.muted }]}>
              {difficultyLabel(mode)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  chipText: { fontSize: 12, fontWeight: "700" },
});
