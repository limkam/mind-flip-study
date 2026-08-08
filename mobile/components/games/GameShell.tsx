import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useCallback, useEffect } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { Screen } from "../Screen";
import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

type Props = { title: string; subtitle?: string; onBack?: () => void; confirmExit?: boolean; children: ReactNode };

export function GameShell({ title, subtitle, onBack, confirmExit = false, children }: Props) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const leave = useCallback(() => { if (onBack) onBack(); else router.back(); }, [onBack, router]);
  const requestExit = useCallback(() => {
    if (!confirmExit) { leave(); return; }
    Alert.alert("Leave this game?", "This run is only saved after you finish.", [
      { text: "Keep playing", style: "cancel" }, { text: "Leave", style: "destructive", onPress: leave },
    ]);
  }, [confirmExit, leave]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { requestExit(); return true; });
    return () => subscription.remove();
  }, [requestExit]);

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave game" hitSlop={8} style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.65 : 1 }]} onPress={requestExit}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
        <View style={styles.headerText}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}</View>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><View style={styles.inner}>{children}</View></ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md, paddingHorizontal: TOKENS.spacing.lg, paddingVertical: TOKENS.spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, headerText: { flex: 1 }, title: { ...TOKENS.typography.sectionTitle }, sub: { ...TOKENS.typography.caption, marginTop: 1 },
  content: { flexGrow: 1, paddingHorizontal: TOKENS.spacing.lg, paddingTop: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing.xxxl, alignItems: "center" }, inner: { width: "100%", maxWidth: 680 },
});
