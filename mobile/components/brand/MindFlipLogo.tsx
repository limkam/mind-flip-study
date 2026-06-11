import { Image, StyleSheet, type ImageStyle, type StyleProp } from "react-native";

const wordmarkSource = require("../../assets/mindflip-logo-wordmark.png");
const iconSource = require("../../assets/mindflip-icon.png");

type Props = {
  height?: number;
  maxWidth?: number;
  style?: StyleProp<ImageStyle>;
  compact?: boolean;
};

export function MindFlipLogo({ height = 44, maxWidth, style, compact = false }: Props) {
  return (
    <Image
      source={compact ? iconSource : wordmarkSource}
      accessibilityLabel="MindFlip"
      style={[
        compact ? styles.compact : styles.wordmark,
        {
          height,
          width: compact ? height : maxWidth ?? "100%",
          maxWidth: compact ? height : maxWidth ?? "100%",
        },
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

const styles = StyleSheet.create({
  wordmark: { maxWidth: "100%" },
  compact: { borderRadius: 10 },
});
