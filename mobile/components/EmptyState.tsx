import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";

type Props = {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          style={[styles.action, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("light");
            onAction();
          }}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: "700", marginTop: 16, textAlign: "center" },
  message: { fontSize: 15, textAlign: "center", marginTop: 8, lineHeight: 22 },
  action: {
    marginTop: 24,
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
