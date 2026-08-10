import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

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
  style?: StyleProp<ViewStyle>;
};

export function MindFlipLogoMark({ size = 44, style }: MarkProps) {
  return (
    <View
      accessibilityLabel="MindFlip"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: "#4f46e5",
          justifyContent: "center",
          alignItems: "center",
          transform: [{ rotate: "30deg" }],
        },
        style,
      ]}
    >
      <Text
        style={{
          color: "#ffffff",
          fontWeight: "900",
          fontSize: size * 0.48,
          transform: [{ rotate: "-30deg" }],
        }}
      >
        M
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { maxWidth: "100%" },
  compact: { borderRadius: 10 },
});
