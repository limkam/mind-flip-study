import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { BilkeysLogoMark } from "../components/brand/BilkeysBrand";
import { DateOfBirthField } from "../components/DateOfBirthField";
import { SelectField } from "../components/SelectField";
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
import { calculateAge } from "../lib/ageUtils";
import { type User, useAuthStore } from "../store/authStore";
import { TOKENS } from "../theme/tokens";

import axios from "axios";

const GENDER_OPTIONS: { value: "male" | "female" | "prefer_not_to_say"; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const { accessToken, user, setAuth } = useAuthStore();
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "prefer_not_to_say" | "">("");
  const [country, setCountry] = useState("");
  const [occupation, setOccupation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submitLockRef = useState(() => ({ current: false }))[0];

  const activeUserId = user?.id;

  useEffect(() => {
    if (activeUserId) void api.post('/activity/onboarding/start').catch(() => undefined);
  }, [activeUserId]);

  const submit = async () => {
    if (!activeUserId || busy || submitLockRef.current) return;
    submitLockRef.current = true;

    setBusy(true);
    setErrorMsg(null);

    const age = calculateAge(dateOfBirth);
    if (age == null || age < 13) {
      setErrorMsg("Bilkeys is only available to users aged 13 and above.");
      submitLockRef.current = false;
      setBusy(false);
      return;
    }
    if (!country.trim() || !occupation.trim()) {
      setErrorMsg("Please enter your country and occupation.");
      submitLockRef.current = false;
      setBusy(false);
      return;
    }

    try {
      const { data } = await api.post<User>("/auth/onboarding", {
        full_name: name.trim() || null,
        date_of_birth: dateOfBirth,
        gender: gender || null,
        country: country.trim(),
        custom_country: null,
        occupation: occupation.trim(),
        job_title: jobTitle.trim() || null,
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
        <BilkeysLogoMark size={64} style={styles.logoMark} />
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

        <DateOfBirthField label="Date of birth" value={dateOfBirth} onChange={(value) => { setDateOfBirth(value); setErrorMsg(null); }} />

        <SelectField
          label="Gender (optional)"
          value={GENDER_OPTIONS.find((o) => o.value === gender)?.label || ""}
          options={GENDER_OPTIONS.map((o) => o.label)}
          placeholder="Select gender"
          onChange={(label) => setGender(GENDER_OPTIONS.find((o) => o.label === label)?.value || "")}
        />

        <AppTextInput label="Country" placeholder="Your country" value={country} onChangeText={setCountry} autoCapitalize="words" />

        <AppTextInput label="Occupation" placeholder="e.g. Software Engineering" value={occupation} onChangeText={setOccupation} />

        <AppTextInput label="Job title (optional)" placeholder="e.g. Senior Backend Engineer" value={jobTitle} onChangeText={setJobTitle} />

        <AppButton
          label="Continue to Bilkeys"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          disabled={busy || !dateOfBirth || !country.trim() || !occupation.trim()}
          onPress={() => void submit()}
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
