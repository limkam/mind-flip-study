import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";
import { AppButton } from "./AppButton";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't complete your request. Please check your connection and try again.",
  onRetry,
  retryLabel = "Try again",
  secondaryActionLabel,
  onSecondaryAction,
  style,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconWrap, { backgroundColor: `${colors.danger}15` }]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
      ) : null}

      <View style={styles.actionRow}>
        {onRetry ? (
          <AppButton
            label={retryLabel}
            onPress={onRetry}
            variant="primary"
            size="md"
            icon="refresh"
            style={styles.actionBtn}
          />
        ) : null}

        {secondaryActionLabel && onSecondaryAction ? (
          <AppButton
            label={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="ghost"
            size="md"
            style={styles.actionBtn}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: TOKENS.spacing.xxl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: TOKENS.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: TOKENS.spacing.lg,
  },
  title: {
    fontSize: TOKENS.typography.sectionTitle.fontSize,
    fontWeight: TOKENS.typography.sectionTitle.fontWeight,
    lineHeight: TOKENS.typography.sectionTitle.lineHeight,
    textAlign: "center",
    marginBottom: TOKENS.spacing.sm,
  },
  message: {
    fontSize: TOKENS.typography.body.fontSize,
    lineHeight: TOKENS.typography.body.lineHeight,
    textAlign: "center",
    marginBottom: TOKENS.spacing.xl,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.md,
  },
  actionBtn: {
    minWidth: 130,
  },
});
