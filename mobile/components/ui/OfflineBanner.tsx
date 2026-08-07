import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

type Props = {
  message?: string;
  style?: StyleProp<ViewStyle>;
};

export function OfflineBanner({
  message = "You are currently offline. Local progress will sync when reconnected.",
  style,
}: Props) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          backgroundColor: `${colors.warning}18`,
          borderColor: `${colors.warning}40`,
        },
        style,
      ]}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={18}
        color={colors.warning}
        style={styles.icon}
      />
      <Text style={[styles.text, { color: colors.textPrimary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.md,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    marginHorizontal: TOKENS.spacing.lg,
    marginVertical: TOKENS.spacing.sm,
  },
  icon: {
    marginRight: TOKENS.spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    fontWeight: TOKENS.typography.caption.fontWeight,
  },
});
