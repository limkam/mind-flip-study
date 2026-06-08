import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";

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
            style={[styles.opt, { backgroundColor: bg, borderColor: border }]}
            disabled={disabled || showResult}
            onPress={() => {
              void hapticImpact("light");
              onSelect(opt);
            }}
          >
            <Text style={[styles.optText, { color: colors.text }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 12 },
  opt: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  optText: { fontSize: 15, fontWeight: "500" },
});
