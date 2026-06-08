import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "../Screen";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
};

export function GameShell({ title, subtitle, onBack, children }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen edges={["bottom"]}>
      <View style={styles.header}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {
            void hapticImpact("light");
            if (onBack) onBack();
            else router.back();
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "700" }}>← Back</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sub, { color: colors.muted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: "800" },
  sub: { fontSize: 13, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
});
