import { type ReactNode } from "react";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

type Props = {
  /** Fixed pixel width, or `"100%"` to fill the parent (the edge layers are absolutely inset either way). */
  width: DimensionValue;
  height: number;
  radius?: number;
  /** Extra top space reserved for the two peeking edge slivers. */
  peekTop?: number;
  /** Horizontal inset of the farthest (bottom) edge layer. */
  farInset?: number;
  /** Horizontal inset of the nearer edge layer. */
  nearInset?: number;
  /** Vertical offset of the nearer edge layer. */
  nearOffset?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** Bilkeys's card-stack signature: two tonal layers peeking above the foreground card. */
export function StackCard({
  width,
  height,
  radius = TOKENS.radii.lg,
  peekTop = 14,
  farInset = 16,
  nearInset = 8,
  nearOffset = 6,
  style,
  children,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={[{ width, paddingTop: peekTop }, style]}>
      <View
        style={[
          styles.edge,
          {
            top: 0,
            left: farInset,
            right: farInset,
            height,
            borderRadius: radius,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            opacity: 0.45,
          },
        ]}
      />
      <View
        style={[
          styles.edge,
          {
            top: nearOffset,
            left: nearInset,
            right: nearInset,
            height,
            borderRadius: radius,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            opacity: 0.75,
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: "absolute",
    borderWidth: 1,
  },
});
