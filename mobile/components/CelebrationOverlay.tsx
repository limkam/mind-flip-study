import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import type { NormalizedCelebration } from "../lib/celebrations/policy";
import { mayUseMajorAnimation } from "../lib/celebrations/policy";
import { TOKENS } from "../theme/tokens";
import { CelebrationBurst } from "./celebrations/CelebrationBurst";

export interface CelebrationOverlayProps { active: NormalizedCelebration | null; onDismiss: (reason?: string) => void; reduceMotion: boolean; animationsEnabled: boolean }

function eventIcon(active: NormalizedCelebration): keyof typeof Ionicons.glyphMap {
  if (active.type === "streak_extended" || active.type === "streak_milestone") return "flame";
  if (active.type === "achievement_unlock") return "ribbon";
  if (active.type === "course_complete") return "trophy";
  return "checkmark-circle";
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({ active, onDismiss, reduceMotion, animationsEnabled }) => {
  const { colors } = useTheme();
  useEffect(() => {
    if (!active) return;
    const reward = typeof active.metadata.xpAwarded === "number" && active.metadata.xpAwarded > 0 ? ` ${active.metadata.xpAwarded} XP awarded.` : "";
    AccessibilityInfo.announceForAccessibility(`${active.title || "Progress recognized"}. ${active.message || ""}${reward}`.trim());
  }, [active]);
  if (!active) return null;

  const title = active.title || (active.level === "major" ? "Milestone reached" : active.level === "medium" ? "Achievement unlocked" : "Progress saved");
  const xpAwarded = typeof active.metadata.xpAwarded === "number" && Number.isFinite(active.metadata.xpAwarded) && active.metadata.xpAwarded > 0 ? Math.trunc(active.metadata.xpAwarded) : null;
  const icon = eventIcon(active);
  const showBurst = active.level === "major" && mayUseMajorAnimation(active) && !reduceMotion && animationsEnabled;

  const content = <>
    <View style={[styles.icon, { backgroundColor: active.type.includes("streak") ? colors.streak + "22" : colors.primarySoft }]}><Ionicons name={icon} size={active.level === "major" ? 40 : 28} color={active.type.includes("streak") ? colors.streak : colors.primary} /></View>
    <View style={styles.copy}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>{active.message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{active.message}</Text> : null}{xpAwarded ? <View style={[styles.reward, { backgroundColor: colors.xp + "20" }]}><Ionicons name="sparkles" size={16} color={colors.xp} /><Text style={[styles.rewardText, { color: colors.xp }]}>+{xpAwarded} XP</Text></View> : null}</View>
  </>;

  if (active.level === "subtle") return <View style={styles.toastContainer} pointerEvents="box-none"><View accessibilityRole="alert" style={[styles.toast, TOKENS.elevation.raised, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>{content}<Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={styles.close} onPress={() => onDismiss("close_button")}><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable></View></View>;

  if (active.level === "medium") return <View style={styles.bannerContainer} pointerEvents="box-none"><View accessibilityRole="alert" style={[styles.banner, TOKENS.elevation.floating, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong }]}>{content}<Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={styles.close} onPress={() => onDismiss("close_button")}><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable></View></View>;

  return <Modal transparent visible animationType={reduceMotion || !animationsEnabled ? "none" : "fade"} onRequestClose={() => onDismiss("hardware_back")}><View style={[styles.overlay, { backgroundColor: colors.overlay }]}><View accessibilityViewIsModal accessibilityRole="alert" style={[styles.modal, TOKENS.elevation.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong }]}>{showBurst ? <CelebrationBurst eventId={active.eventId} colors={{ primary: colors.primary, xp: colors.xp, success: colors.success, streak: colors.streak }} /> : null}{content}<Pressable accessibilityRole="button" style={[styles.action, { backgroundColor: colors.primary }]} onPress={() => onDismiss("continue_button")}><Text style={[styles.actionText, { color: colors.onPrimary }]}>Continue</Text></Pressable></View></View></Modal>;
};

const styles = StyleSheet.create({
  toastContainer: { position: "absolute", bottom: TOKENS.spacing.xl, left: TOKENS.spacing.lg, right: TOKENS.spacing.lg, zIndex: 999, alignItems: "center" },
  toast: { width: "100%", maxWidth: 440, minHeight: 64, borderRadius: TOKENS.radii.lg, borderWidth: 1, padding: TOKENS.spacing.md, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  bannerContainer: { position: "absolute", bottom: TOKENS.spacing.xxl, left: TOKENS.spacing.lg, right: TOKENS.spacing.lg, zIndex: 999, alignItems: "center" },
  banner: { width: "100%", maxWidth: 440, minHeight: 92, borderRadius: TOKENS.radii.xl, borderWidth: 1, padding: TOKENS.spacing.lg, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: TOKENS.spacing.xl }, modal: { width: "100%", maxWidth: 380, borderRadius: TOKENS.radii.xl, borderWidth: 1, padding: TOKENS.spacing.xl, alignItems: "center", overflow: "hidden" },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }, copy: { flex: 1 }, title: { ...TOKENS.typography.sectionTitle }, message: { ...TOKENS.typography.secondaryBody, marginTop: TOKENS.spacing.xs }, reward: { alignSelf: "flex-start", borderRadius: TOKENS.radii.pill, paddingHorizontal: TOKENS.spacing.md, minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6, marginTop: TOKENS.spacing.md }, rewardText: { ...TOKENS.typography.label },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, action: { width: "100%", minHeight: 48, borderRadius: TOKENS.radii.md, alignItems: "center", justifyContent: "center", marginTop: TOKENS.spacing.xl }, actionText: { ...TOKENS.typography.buttonLabel },
});
