import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { MindFlipLogoMark } from "../components/brand/MindFlipBrand";
import {
  AppBadge,
  AppButton,
  AppCard,
  AppScreen,
  AppTextInput,
} from "../components/ui";
import { useTheme } from "../hooks/useTheme";
import { getApiErrorMessage } from "../lib/apiErrors";
import { hapticError, hapticSuccess } from "../lib/haptics";
import { safeReturnRoute } from "../lib/returnRoute";
import { type User, useAuthStore } from "../store/authStore";
import { TOKENS } from "../theme/tokens";

import axios from "axios";

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const { accessToken, user, setAuth } = useAuthStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submitLockRef = useState(() => ({ current: false }))[0];

  const activeUserId = user?.id;

  const submit = async (skip = false) => {
    if (!activeUserId || busy || submitLockRef.current) return;
    submitLockRef.current = true;

    setBusy(true);
    setErrorMsg(null);

    const fullNameToSubmit = skip ? null : (name.trim() || null);

    try {
      const { data } = await api.post<User>("/auth/onboarding", {
        full_name: fullNameToSubmit,
      });

      // Verify user identity didn't change during request
      if (useAuthStore.getState().user?.id !== activeUserId) return;

      if (accessToken) setAuth(data, accessToken);

      void hapticSuccess();

      const targetRoute = safeReturnRoute(params.returnTo);
      if (targetRoute) {
        router.replace(targetRoute as never);
      } else {
        router.replace("/(tabs)");
      }
    } catch (error: unknown) {
      if (useAuthStore.getState().user?.id !== activeUserId) return;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 400 || status === 422) {
        void hapticError();
      }
      setErrorMsg(getApiErrorMessage(error, "Could not finish profile setup. Please try again."));
    } finally {
      submitLockRef.current = false;
      if (useAuthStore.getState().user?.id === activeUserId) {
        setBusy(false);
      }
    }
  };

  return (
    <AppScreen keyboard scrollable style={styles.root} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerStack}>
        <AppBadge label="Profile Setup" variant="primary" style={styles.badge} />
        <MindFlipLogoMark size={64} style={styles.logoMark} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          What should we call you?
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Enter your name to personalize your profile, or skip to continue.
        </Text>
      </View>

      <AppCard variant="elevated" style={styles.card}>
        {errorMsg ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.errorBanner, { backgroundColor: `${colors.danger}12`, borderColor: `${colors.danger}30` }]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
          </View>
        ) : null}

        <AppTextInput
          label="Display Name"
          placeholder={user?.full_name || "Your name (e.g. Alex Morgan)"}
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (errorMsg) setErrorMsg(null);
          }}
          maxLength={255}
          textContentType="name"
          autoFocus
          containerStyle={styles.inputContainer}
        />

        <AppButton
          label="Continue to MindFlip"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={() => void submit(false)}
        />

        <AppButton
          label="Skip for now"
          variant="ghost"
          size="md"
          fullWidth
          disabled={busy}
          onPress={() => void submit(true)}
        />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.xxl,
    justifyContent: "center",
  },
  headerStack: {
    alignItems: "center",
    marginBottom: TOKENS.spacing.xxl,
  },
  badge: {
    marginBottom: TOKENS.spacing.md,
  },
  logoMark: {
    marginBottom: TOKENS.spacing.md,
  },
  title: {
    fontSize: TOKENS.typography.screenTitle.fontSize,
    fontWeight: TOKENS.typography.screenTitle.fontWeight,
    lineHeight: TOKENS.typography.screenTitle.lineHeight,
    textAlign: "center",
  },
  subtitle: {
    fontSize: TOKENS.typography.secondaryBody.fontSize,
    lineHeight: TOKENS.typography.secondaryBody.lineHeight,
    marginTop: TOKENS.spacing.xs,
    textAlign: "center",
    maxWidth: 300,
  },
  card: {
    gap: TOKENS.spacing.md,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    fontWeight: TOKENS.typography.bodyEmphasis.fontWeight,
  },
  inputContainer: {
    marginBottom: TOKENS.spacing.xs,
  },
});
