import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";
import { Orbit } from "../brand/motifs/Orbit";

type Props = {
  children: ReactNode;
  /** Decorative depth orbs — on by default, disable for small/dense brand surfaces. */
  orbs?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/** The brand gradient surface: indigo → violet, orbital depth, coloured shadow. Reserved for hero moments. */
export function BrandSurface({ children, orbs = true, radius = TOKENS.radii.xl, style }: Props) {
  const { gradients, elevationBrand } = useTheme();

  return (
    <View style={[{ borderRadius: radius }, elevationBrand, style]}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { borderRadius: radius }]}
      >
        {orbs ? <Orbit /> : null}
        <View style={styles.content}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    overflow: "hidden",
    padding: TOKENS.spacing.xl,
  },
  content: {
    position: "relative",
  },
});
