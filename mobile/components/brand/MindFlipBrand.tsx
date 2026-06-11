import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";

const wordmarkSource = require("../../assets/mindflip-logo-wordmark.png");
const iconSource = require("../../assets/mindflip-icon.png");

type LogoProps = {
  height?: number;
  style?: StyleProp<ImageStyle>;
  centered?: boolean;
};

/** Full horizontal logo: brain icon + MindFlip name. */
export function MindFlipLogo({ height = 44, style, centered = false }: LogoProps) {
  return (
    <Image
      source={wordmarkSource}
      accessibilityLabel="MindFlip"
      style={[
        styles.wordmark,
        { height, width: centered ? 280 : "100%" as const },
        style,
      ]}
      resizeMode="contain"
    />
  );
}

type MarkProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/** Brain icon only — for compact spaces. */
export function MindFlipLogoMark({ size = 44, style }: MarkProps) {
  return (
    <Image
      source={iconSource}
      accessibilityLabel="MindFlip"
      style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]}
      resizeMode="contain"
    />
  );
}

type BrandProps = {
  centered?: boolean;
  compact?: boolean;
  showTagline?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MindFlipBrand({
  centered = false,
  compact = false,
  showTagline = true,
  style,
}: BrandProps) {
  const { colors } = useTheme();

  if (compact) {
    return (
      <View style={style}>
        <MindFlipLogoMark size={40} />
      </View>
    );
  }

  return (
    <View style={[centered ? styles.centered : styles.rowStack, style]}>
      <MindFlipLogo height={centered ? 52 : 40} centered={centered} />
      {showTagline ? (
        <Text
          style={[
            centered ? styles.taglineCentered : styles.tagline,
            { color: colors.muted },
          ]}
        >
          AI-Powered Learning
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { maxWidth: "100%" },
  centered: { alignItems: "center", width: "100%" },
  rowStack: { width: "100%", gap: 6 },
  tagline: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  taglineCentered: { fontSize: 14, fontWeight: "600", marginTop: 8, textAlign: "center" },
});
