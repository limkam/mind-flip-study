import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";

type MarkProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const MARK_ROTATION = "20deg";

/** The Bilkeys mark: a tilted rounded-square brand tile with an upright "B". */
export function BilkeysLogoMark({ size = 44, style }: MarkProps) {
  const { gradients, colors } = useTheme();
  const radius = size * 0.28;

  return (
    <View
      accessibilityLabel="Bilkeys"
      style={[{ width: size, height: size, transform: [{ rotate: MARK_ROTATION }] }, style]}
    >
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fill, { borderRadius: radius }]}
      >
        <Text
          style={[
            styles.letter,
            {
              color: colors.onBrand,
              fontSize: size * 0.48,
              transform: [{ rotate: `-${MARK_ROTATION}` }],
            },
          ]}
        >
          B
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  letter: {
    fontWeight: "900",
  },
});
