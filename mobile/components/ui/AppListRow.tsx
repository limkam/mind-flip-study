import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { usePressScale } from "../../hooks/usePressScale";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap | ReactNode;
  iconColor?: string;
  iconBgColor?: string;
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
  enableHaptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppListRow({
  title,
  subtitle,
  icon,
  iconColor,
  iconBgColor,
  trailing,
  showChevron = true,
  onPress,
  active = false,
  disabled = false,
  enableHaptics = false,
  accessibilityLabel,
  style,
}: Props) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale();

  const handlePress = () => {
    if (disabled || !onPress) return;
    if (enableHaptics) {
      void hapticImpact("light");
    }
    onPress();
  };

  const renderLeading = () => {
    if (!icon) return null;
    if (typeof icon === "string") {
      const defaultIconColor = active
        ? colors.onPrimary
        : iconColor ?? colors.primary;
      const defaultBg = active
        ? `${colors.onPrimary}20`
        : iconBgColor ?? `${colors.primary}18`;

      return (
        <View style={[styles.iconWrap, { backgroundColor: defaultBg }]}>
          <Ionicons
            name={icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color={defaultIconColor}
          />
        </View>
      );
    }
    return icon;
  };

  const rowContent = (pressed: boolean) => {
    const bgColor = active
      ? colors.primary
      : pressed
      ? colors.surfaceMuted
      : colors.surface;
    const textColor = active ? colors.onPrimary : colors.textPrimary;
    const subColor = active ? `${colors.onPrimary}CC` : colors.textMuted;
    const chevronColor = active ? colors.onPrimary : colors.textMuted;

    return (
      <View
        style={[
          styles.row,
          {
            backgroundColor: bgColor,
            borderColor: colors.border,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        {renderLeading()}
        <View style={styles.textContainer}>
          <Text
            style={[styles.title, { color: textColor }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: subColor }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        {showChevron && onPress && !trailing ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={chevronColor}
            style={styles.chevron}
          />
        ) : null}
      </View>
    );
  };

  if (onPress) {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={disabled ? undefined : onPressIn}
          onPressOut={disabled ? undefined : onPressOut}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityState={{ disabled }}
        >
          {({ pressed }) => rowContent(pressed)}
        </Pressable>
      </Animated.View>
    );
  }

  return rowContent(false);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.md,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    minHeight: 52, // Touch target requirement
    marginBottom: TOKENS.spacing.sm,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: TOKENS.radii.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: TOKENS.spacing.md,
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: TOKENS.typography.bodyEmphasis.fontSize,
    fontWeight: TOKENS.typography.bodyEmphasis.fontWeight,
    lineHeight: TOKENS.typography.bodyEmphasis.lineHeight,
  },
  subtitle: {
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    marginTop: 2,
  },
  trailing: {
    marginLeft: TOKENS.spacing.md,
  },
  chevron: {
    marginLeft: TOKENS.spacing.sm,
  },
});
