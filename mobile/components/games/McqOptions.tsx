import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

type Props = {
  options: string[];
  selected: string | null;
  correct: string | null;
  showResult: boolean;
  disabled?: boolean;
  onSelect: (option: string) => void;
};

export function McqOptions({ options, selected, correct, showResult, disabled, onSelect }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const isSelected = selected === opt;
        const isCorrect = showResult && opt === correct;
        const isWrong = showResult && isSelected && opt !== correct;
        let bg = colors.surface;
        let border = colors.border;
        if (isCorrect) {
          bg = colors.success + "22";
          border = colors.success;
        } else if (isWrong) {
          bg = colors.danger + "22";
          border = colors.danger;
        } else if (isSelected) {
          border = colors.primary;
        }

        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: !!disabled || showResult }}
            accessibilityLabel={`${opt}${isCorrect ? ", correct answer" : isWrong ? ", incorrect" : ""}`}
            style={[styles.opt, { backgroundColor: bg, borderColor: border }]}
            disabled={disabled || showResult}
            onPress={() => {
              void hapticImpact("light");
              onSelect(opt);
            }}
          >
            <View style={styles.optionRow}><Text style={[styles.optText, { color: colors.text }]}>{opt}</Text>{isCorrect ? <Text style={[styles.feedback, { color: colors.success }]}>Correct</Text> : isWrong ? <Text style={[styles.feedback, { color: colors.danger }]}>Incorrect</Text> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.md },
  opt: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  optText: { ...TOKENS.typography.bodyEmphasis, flex: 1 }, feedback: { ...TOKENS.typography.caption },
});
