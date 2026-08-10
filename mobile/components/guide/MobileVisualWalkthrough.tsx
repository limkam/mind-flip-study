import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RenderMobileVisualDemo } from "./MobileVisualRegistry";
import { useTheme } from "../../hooks/useTheme";

interface Step {
  id: string;
  title: string;
  description: string;
  visualType?: string;
  platformText?: { web: string; mobile: string };
  tip?: string;
}

interface Article {
  id: string;
  title: string;
  summary: string;
  steps?: Step[];
}

export function MobileVisualWalkthrough({ article }: { article: Article }) {
  const { colors } = useTheme();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [platform, setPlatform] = useState<"mobile" | "web">("mobile");

  const steps = article.steps || [];
  if (!steps.length) return null;

  const currentStep = steps[currentStepIndex];

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleRestart = () => {
    setCurrentStepIndex(0);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tag, { color: colors.primary }]}>▶ Guided Walkthrough</Text>
          <Text style={[styles.title, { color: colors.text }]}>{article.title}</Text>
        </View>

        {/* Platform Toggle */}
        <View style={[styles.platToggle, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setPlatform("mobile")}
            style={[
              styles.platBtn,
              { backgroundColor: platform === "mobile" ? colors.primary : "transparent" },
            ]}
          >
            <Ionicons name="phone-portrait-outline" size={12} color={platform === "mobile" ? "#fff" : colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => setPlatform("web")}
            style={[
              styles.platBtn,
              { backgroundColor: platform === "web" ? colors.primary : "transparent" },
            ]}
          >
            <Ionicons name="desktop-outline" size={12} color={platform === "web" ? "#fff" : colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* Progress Dots */}
      <View style={styles.progressRow}>
        <Text style={[styles.stepCount, { color: colors.muted }]}>
          STEP {currentStepIndex + 1} OF {steps.length}
        </Text>
        <View style={styles.dots}>
          {steps.map((st, idx) => (
            <Pressable
              key={st.id}
              onPress={() => setCurrentStepIndex(idx)}
              style={[
                styles.dot,
                {
                  backgroundColor: idx === currentStepIndex ? colors.primary : colors.border,
                  width: idx === currentStepIndex ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Step Content */}
      <View style={styles.stepBlock}>
        {currentStep.visualType ? (
          <RenderMobileVisualDemo visualType={currentStep.visualType} />
        ) : null}

        <Text style={[styles.stepTitle, { color: colors.text }]}>{currentStep.title}</Text>
        <Text style={[styles.stepDesc, { color: colors.muted }]}>{currentStep.description}</Text>

        {currentStep.platformText ? (
          <View style={[styles.platTextCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.platLabel, { color: colors.primary }]}>
              {platform === "mobile" ? "Mobile Instructions" : "Web Instructions"}
            </Text>
            <Text style={[styles.platBody, { color: colors.text }]}>
              {platform === "mobile" ? currentStep.platformText.mobile : currentStep.platformText.web}
            </Text>
          </View>
        ) : null}

        {currentStep.tip ? (
          <View style={[styles.tipCard, { backgroundColor: "#fef3c722", borderColor: "#f59e0b44" }]}>
            <Ionicons name="bulb-outline" size={14} color="#f59e0b" />
            <Text style={{ flex: 1, fontSize: 11, color: "#fbbf24" }}>
              <Text style={{ fontWeight: "700" }}>Tip: </Text>
              {currentStep.tip}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Navigation Buttons */}
      <View style={[styles.navRow, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={handlePrev}
          disabled={currentStepIndex === 0}
          style={[
            styles.navBtn,
            { opacity: currentStepIndex === 0 ? 0.4 : 1, backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Ionicons name="chevron-back" size={14} color={colors.text} />
          <Text style={[styles.navBtnText, { color: colors.text }]}>Prev</Text>
        </Pressable>

        <Pressable onPress={handleRestart} style={styles.restartBtn}>
          <Ionicons name="refresh-outline" size={14} color={colors.muted} />
        </Pressable>

        {currentStepIndex < steps.length - 1 ? (
          <Pressable
            onPress={handleNext}
            style={[styles.navBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={[styles.navBtnText, { color: "#ffffff" }]}>Next</Text>
            <Ionicons name="chevron-forward" size={14} color="#ffffff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleRestart}
            style={[styles.navBtn, { backgroundColor: "#10b981", borderColor: "#10b981" }]}
          >
            <Text style={[styles.navBtnText, { color: "#ffffff" }]}>Replay</Text>
            <Ionicons name="checkmark-done" size={14} color="#ffffff" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, borderRadius: 20, borderWidth: 1, marginVertical: 8 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  tag: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 2 },
  title: { fontSize: 18, fontWeight: "800" },
  platToggle: { flexDirection: "row", borderRadius: 10, borderWidth: 1, padding: 2 },
  platBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 8 },
  stepCount: { fontSize: 10, fontWeight: "800" },
  dots: { flexDirection: "row", gap: 4, alignItems: "center" },
  dot: { height: 6, borderRadius: 3 },
  stepBlock: { marginVertical: 8, gap: 8 },
  stepTitle: { fontSize: 15, fontWeight: "800", marginTop: 4 },
  stepDesc: { fontSize: 12, lineHeight: 18 },
  platTextCard: { padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  platLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 2 },
  platBody: { fontSize: 11, lineHeight: 16 },
  tipCard: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTopWidth: 1, marginTop: 12 },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  navBtnText: { fontSize: 12, fontWeight: "700" },
  restartBtn: { padding: 8 },
});
