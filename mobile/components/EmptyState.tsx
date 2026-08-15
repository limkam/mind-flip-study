import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { TOKENS } from "../theme/tokens";
import { AppButton } from "./ui/AppButton";

type Props = {
  /** An Ionicons glyph name (e.g. "cloud-offline-outline") or a legacy emoji string. */
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional decorative illustration, rendered above the icon/title. */
  illustration?: ReactNode;
};

const IONICON_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isIoniconName(icon: string): icon is keyof typeof Ionicons.glyphMap {
  return IONICON_NAME_PATTERN.test(icon) && icon in Ionicons.glyphMap;
}

export function EmptyState({ icon, title, message, actionLabel, onAction, illustration }: Props) {
  const { colors } = useTheme();
  const useIonicon = isIoniconName(icon);

  return (
    <View style={styles.wrap}>
      {illustration}
      {useIonicon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={30} color={colors.primary} />
        </View>
      ) : (
        <Text style={styles.emoji}>{icon}</Text>
      )}
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
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 48 },
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
