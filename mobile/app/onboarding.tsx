import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../api/client";
import { MindFlipBrand } from "../components/brand/MindFlipBrand";
import { Screen } from "../components/Screen";
import { useTheme } from "../hooks/useTheme";
import { getApiErrorMessage } from "../lib/apiErrors";
import { hapticImpact } from "../lib/haptics";
import { safeReturnRoute } from "../lib/returnRoute";
import { type User, useAuthStore } from "../store/authStore";

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const { accessToken, user, setAuth } = useAuthStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const activeUserId = user?.id;

  const submit = async () => {
    if (!activeUserId) return;
    setBusy(true);
    try {
      const { data } = await api.post<User>("/auth/onboarding", {
        full_name: name.trim() || null,
      });

      // Verify user identity didn't change during request
      if (useAuthStore.getState().user?.id !== activeUserId) return;

      if (accessToken) setAuth(data, accessToken);

      const targetRoute = safeReturnRoute(params.returnTo);
      if (targetRoute) {
        router.replace(targetRoute as never);
      } else {
        router.replace("/(tabs)");
      }
    } catch (error: unknown) {
      if (useAuthStore.getState().user?.id !== activeUserId) return;
      Alert.alert(
        "Could not finish setup",
        getApiErrorMessage(error, "Please try again."),
      );
    } finally {
      if (useAuthStore.getState().user?.id === activeUserId) {
        setBusy(false);
      }
    }
  };

  return (
    <Screen keyboard style={styles.root}>
      <View style={styles.content}>
        <MindFlipBrand centered style={{ marginBottom: 28 }} />
        <Text style={[styles.title, { color: colors.text }]}>
          What should we call you?
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          You can skip this and update your name later.
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.background,
            },
          ]}
          value={name}
          onChangeText={setName}
          maxLength={255}
          textContentType="name"
          placeholder={user?.full_name || "Your name"}
          placeholderTextColor={colors.muted}
          autoFocus
        />
        <Pressable
          style={[
            styles.button,
            { backgroundColor: colors.primary },
            busy && styles.disabled,
          ]}
          onPress={() => {
            void hapticImpact("light");
            void submit();
          }}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: "center", padding: 24 },
  content: { alignItems: "center" },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { marginTop: 8, fontSize: 14, textAlign: "center" },
  input: {
    width: "100%",
    minHeight: 48,
    marginTop: 28,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  button: {
    width: "100%",
    minHeight: 48,
    marginTop: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.65 },
});
