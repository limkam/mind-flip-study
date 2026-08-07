import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { TOKENS } from "../theme/tokens";
import { AppButton } from "./ui/AppButton";

type Props = {
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={styles.actionBtn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: TOKENS.spacing.xxl,
  },
  icon: { fontSize: 48 },
  title: {
    fontSize: TOKENS.typography.screenTitle.fontSize - 4,
    fontWeight: TOKENS.typography.screenTitle.fontWeight,
    marginTop: TOKENS.spacing.lg,
    textAlign: "center",
  },
  message: {
    fontSize: TOKENS.typography.body.fontSize,
    textAlign: "center",
    marginTop: TOKENS.spacing.sm,
    lineHeight: TOKENS.typography.body.lineHeight,
  },
  actionBtn: {
    marginTop: TOKENS.spacing.xl,
    minWidth: 140,
  },
});
