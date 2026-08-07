import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MindFlipBrand } from "../../components/brand/MindFlipBrand";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { useTheme, type ThemeColors } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticImpact } from "../../lib/haptics";
import { type User, useAuthStore } from "../../store/authStore";

WebBrowser.maybeCompleteAuthSession();

function isGoogleAuthConfigured(): boolean {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (Platform.OS === "ios") {
    return !!(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || webClientId);
  }
  if (Platform.OS === "android") {
    return !!(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || webClientId);
  }
  return !!webClientId;
}

function postLoginRoute(user: User): "/onboarding" | "/(tabs)" {
  return user.onboarding_completed === false ? "/onboarding" : "/(tabs)";
}

function GoogleSignInButton({ colors }: { colors: ThemeColors }) {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const webId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const platformId = Platform.select({
    ios: iosId || webId,
    android: androidId || webId,
    default: webId,
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: platformId,
    webClientId: webId,
    iosClientId: iosId || webId,
    androidClientId: androidId || webId,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.authentication?.idToken;
    if (!idToken) {
      Alert.alert("Google sign-in failed", "No id_token on response — check OAuth client IDs in .env.");
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const { setNativeRefreshToken, clearNativeRefreshToken } = await import("../../lib/nativeSession");
        const keepSignedIn = useAuthStore.getState().keepSignedIn;
        const { data } = await api.post<{ access_token: string; refresh_token?: string; user: User }>("/auth/google", {
          id_token: idToken,
          remember_me: keepSignedIn,
          client: "mobile",
        });
        if (data.refresh_token) {
          await setNativeRefreshToken(data.refresh_token, { persistent: keepSignedIn });
        } else {
          await clearNativeRefreshToken();
        }
        setAuth(data.user, data.access_token);
        router.replace(postLoginRoute(data.user));
      } catch (e: unknown) {
        Alert.alert("Google sign-in failed", getApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [response, router, setAuth]);

  return (
    <Pressable
      style={[styles.altButton, { borderColor: colors.border, backgroundColor: colors.background }]}
      onPress={() => {
        void hapticImpact("light");
        void promptAsync();
      }}
      disabled={!request || busy}
    >
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Ionicons name="logo-google" size={20} color="#1e293b" />
          <Text style={[styles.altButtonText, { color: colors.text }]}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const emailLogin = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Enter your email address.");
      return;
    }
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data } = await api.post<{ challenge_id: string; resend_after: number }>("/auth/email/start", {
        email: normalizedEmail,
      });
      router.push({
        pathname: "/(auth)/verify-email",
        params: { email: normalizedEmail, challengeId: data.challenge_id, resendAfter: String(data.resend_after) },
      });
    } catch (e: unknown) {
      Alert.alert("Could not send code", getApiErrorMessage(e, "Please try again shortly."));
    } finally {
      setBusy(false);
    }
  };

  const googleConfigured = isGoogleAuthConfigured();

  return (
    <Screen keyboard style={styles.root}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MindFlipBrand centered style={{ marginBottom: 16 }} />
        <Text style={[styles.title, { color: colors.text }]}>
          {authMode === "signup" ? "Create your account" : "Welcome back"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {authMode === "signup" ? "Start learning with MindFlip" : "Continue your learning journey"}
        </Text>

        <View style={[styles.modeSwitch, { borderColor: colors.border, backgroundColor: colors.background }]}>
          {(["signin", "signup"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.modeButton, authMode === mode && { backgroundColor: colors.surface }]}
              onPress={() => setAuthMode(mode)}
            >
              <Text style={{ color: authMode === mode ? colors.text : colors.muted, fontWeight: "600" }}>
                {mode === "signin" ? "Sign in" : "Sign up"}
              </Text>
            </Pressable>
          ))}
        </View>

        {googleConfigured ? (
          <GoogleSignInButton colors={colors} />
        ) : (
          <Pressable
            style={[styles.altButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => Alert.alert("Google sign-in is not configured", "Add a Google OAuth client ID to the mobile environment and restart Expo.")}
          >
            <Ionicons name="logo-google" size={20} color={colors.text} />
            <Text style={[styles.altButtonText, { color: colors.text }]}>Continue with Google</Text>
          </Pressable>
        )}

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.line} />
        </View>

        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          placeholder="Email address"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Pressable
          style={[styles.altButton, { borderColor: colors.border, backgroundColor: colors.background }, busy && styles.buttonDisabled]}
          onPress={() => {
            void hapticImpact("light");
            void emailLogin();
          }}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color={colors.text} /> : (
            <>
              <Ionicons name="mail-outline" size={20} color={colors.text} />
              <Text style={[styles.altButtonText, { color: colors.text }]}>Continue with Email</Text>
            </>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: "center", padding: 24 },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
  },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginBottom: 8 },
  modeSwitch: { flexDirection: "row", borderWidth: 1, borderRadius: 10, padding: 4 },
  modeButton: { flex: 1, minHeight: 36, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  line: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dividerText: { marginHorizontal: 12, color: "#64748b", fontSize: 13 },
  altButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    minHeight: 44,
  },
  altButtonText: { fontSize: 16, fontWeight: "600" },
});
