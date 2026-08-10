import { useRouter } from "expo-router";
import { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";
import { IconButton } from "./IconButton";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
  style,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.header, { borderColor: colors.border }, style]}>
      <View style={styles.topRow}>
        {showBack ? (
          <IconButton
            icon="chevron-back"
            onPress={handleBack}
            accessibilityLabel="Go back"
            variant="ghost"
            style={styles.backButton}
          />
        ) : null}

        <View style={styles.titleWrap}>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightAction ? <View style={styles.rightWrap}>{rightAction}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: TOKENS.spacing.lg,
    paddingTop: TOKENS.spacing.sm,
    paddingBottom: TOKENS.spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: TOKENS.spacing.sm,
    marginLeft: -TOKENS.spacing.xs,
  },
  titleWrap: {
    flex: 1,
    flexShrink: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: TOKENS.typography.screenTitle.fontSize,
    fontWeight: TOKENS.typography.screenTitle.fontWeight,
    lineHeight: TOKENS.typography.screenTitle.lineHeight,
  },
  subtitle: {
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    marginTop: 2,
  },
  rightWrap: {
    marginLeft: TOKENS.spacing.md,
  },
});
