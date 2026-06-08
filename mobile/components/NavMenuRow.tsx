import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";

type Props = {
  label: string;
  icon: string;
  onPress: () => void;
  active?: boolean;
};

export function NavMenuRow({ label, icon, onPress, active }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={[
        styles.row,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: colors.border,
        },
      ]}
      onPress={() => {
        void hapticImpact("light");
        onPress();
      }}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: active ? "rgba(255,255,255,0.2)" : `${colors.primary}18` },
        ]}
      >
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={20}
          color={active ? "#fff" : colors.primary}
        />
      </View>
      <Text style={[styles.label, { color: active ? "#fff" : colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={active ? "#fff" : colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: 52,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1, fontSize: 15, fontWeight: "600" },
});
