import React, { useEffect } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { NormalizedCelebration } from "../lib/celebrations/policy";
import { mayUseMajorAnimation } from "../lib/celebrations/policy";

export interface CelebrationOverlayProps {
  active: NormalizedCelebration | null;
  onDismiss: (reason?: string) => void;
  reduceMotion: boolean;
  animationsEnabled: boolean;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  active,
  onDismiss,
  reduceMotion,
  animationsEnabled,
}) => {
  useEffect(() => {
    if (active) {
      const announcement = active.message
        ? `${active.title || "Celebration"}: ${active.message}`
        : active.title || "Celebration";
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [active]);

  if (!active) return null;

  const level = active.level;
  const isMajor = level === "major";
  const isMedium = level === "medium";
  const showParticles = isMajor && mayUseMajorAnimation(active) && !reduceMotion && animationsEnabled;

  const iconEmoji = isMajor
    ? "🏆"
    : isMedium
      ? "🏅"
      : active.type === "streak_extended" || active.type === "streak_milestone"
        ? "🔥"
        : "✅";

  const defaultTitle = isMajor
    ? "Amazing work!"
    : isMedium
      ? "Achievement unlocked"
      : "Progress saved";

  const titleText = active.title || defaultTitle;
  const messageText = active.message;

  if (level === "subtle") {
    return (
      <View style={styles.subtleContainer} pointerEvents="box-none">
        <View style={styles.subtleCard} accessibilityRole="alert">
          <Text style={styles.iconText} aria-hidden>{iconEmoji}</Text>
          <View style={styles.textContainer}>
            <Text style={styles.subtleTitle}>{titleText}</Text>
            {!!messageText && <Text style={styles.subtleMessage}>{messageText}</Text>}
          </View>
          <Pressable
            onPress={() => onDismiss("close_button")}
            style={styles.closeButton}
            accessibilityLabel="Dismiss celebration"
            accessibilityRole="button"
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (level === "medium") {
    return (
      <View style={styles.mediumContainer} pointerEvents="box-none">
        <View style={styles.mediumCard} accessibilityRole="alert">
          <View style={styles.mediumHeader}>
            <Text style={styles.majorIconText} aria-hidden>{iconEmoji}</Text>
            <Pressable
              onPress={() => onDismiss("close_button")}
              style={styles.closeButton}
              accessibilityLabel="Dismiss celebration"
              accessibilityRole="button"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.mediumTitle}>{titleText}</Text>
          {!!messageText && <Text style={styles.mediumMessage}>{messageText}</Text>}
        </View>
      </View>
    );
  }

  // Major level modal
  return (
    <Modal
      transparent
      visible
      animationType={reduceMotion || !animationsEnabled ? "none" : "fade"}
      onRequestClose={() => onDismiss("hardware_back")}
    >
      <View style={styles.majorOverlay}>
        <View style={styles.majorCard} aria-modal>
          <Text style={styles.majorBadgeEmoji} aria-hidden>{iconEmoji}</Text>
          <Text style={styles.majorTitle}>{titleText}</Text>
          {!!messageText && <Text style={styles.majorMessage}>{messageText}</Text>}
          <Pressable
            onPress={() => onDismiss("close_button")}
            style={styles.actionButton}
            accessibilityLabel="Continue"
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  subtleContainer: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: "center",
  },
  subtleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    maxWidth: 400,
    width: "100%",
  },
  iconText: {
    fontSize: 20,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  subtleTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  subtleMessage: {
    color: "#D1D5DB",
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    marginLeft: 8,
  },
  closeButtonText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "bold",
  },
  mediumContainer: {
    position: "absolute",
    bottom: 32,
    left: 20,
    right: 20,
    zIndex: 999,
    alignItems: "center",
  },
  mediumCard: {
    backgroundColor: "#111827",
    borderColor: "#374151",
    borderWidth: 1,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    maxWidth: 400,
    width: "100%",
  },
  mediumHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  majorIconText: {
    fontSize: 32,
  },
  mediumTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "700",
  },
  mediumMessage: {
    color: "#E5E7EB",
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  majorOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  majorCard: {
    backgroundColor: "#111827",
    borderColor: "#4B5563",
    borderWidth: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    maxWidth: 360,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 12,
  },
  particleBanner: {
    marginBottom: 12,
  },
  particleText: {
    fontSize: 22,
  },
  majorBadgeEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  majorTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  majorMessage: {
    color: "#E5E7EB",
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 22,
  },
  actionButton: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
