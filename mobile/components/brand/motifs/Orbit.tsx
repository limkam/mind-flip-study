import { StyleSheet, View } from "react-native";

import { useTheme } from "../../../hooks/useTheme";

/** Soft off-canvas colour orbs — MindFlip's signature depth texture on brand surfaces. */
export function Orbit() {
  const { colors } = useTheme();

  return (
    <>
      <View pointerEvents="none" style={[styles.orbWarm, { backgroundColor: colors.orbWarm }]} />
      <View pointerEvents="none" style={[styles.orbCool, { backgroundColor: colors.orbCool }]} />
    </>
  );
}

const styles = StyleSheet.create({
  orbWarm: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -70,
    top: -85,
  },
  orbCool: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    left: -55,
    bottom: -90,
  },
});
