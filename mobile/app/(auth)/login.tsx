import { Ionicons } from "@expo/vector-icons";
import appleAuth, { AppleButton, AppleError } from "@invertase/react-native-apple-authentication";
import { Link, useRouter } from "expo-router";
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

import { PasswordInput } from "../../components/PasswordInput";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { useTheme, type ThemeColors } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticImpact } from "../../lib/haptics";
import { type User, useAuthStore } from "../../store/authStore";

WebBrowser.maybeCompleteAuthSession();

function isGoogleAuthConfigured(): boolean {
  if (Platform.OS === "ios") {
    return !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  }
  if (Platform.OS === "android") {
    return !!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  }
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
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

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: webId,
    iosClientId: iosId,
    androidClientId: androidId,
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
        const { data } = await api.post<{ access_token: string; user: User }>("/auth/google", {
          id_token: idToken,
        });
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const emailLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter email and password.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{ access_token: string; user: User }>("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      setAuth(data.user, data.access_token);
      router.replace(postLoginRoute(data.user));
    } catch (e: unknown) {
      Alert.alert("Login failed", getApiErrorMessage(e, "Invalid credentials"));
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    if (Platform.OS !== "ios") {
      Alert.alert("Apple sign-in", "Available on iOS only.");
      return;
    }
    try {
      const credential = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });
      if (!credential.identityToken) {
        Alert.alert("Apple sign-in failed", "No identity token returned.");
        return;
      }
      const { data } = await api.post<{ access_token: string; user: User }>("/auth/apple", {
        identity_token: credential.identityToken,
        full_name: credential.fullName
          ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
          : undefined,
        nonce: credential.nonce,
      });
      setAuth(data.user, data.access_token);
      router.replace(postLoginRoute(data.user));
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === AppleError.CANCELED) {
        return;
      }
      Alert.alert("Apple sign-in failed", getApiErrorMessage(err));
    }
  };

  const googleConfigured = isGoogleAuthConfigured();

  return (
    <Screen keyboard style={styles.root}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Sign in</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <PasswordInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
        />
        <Link href="/(auth)/forgot-password" asChild>
          <Pressable style={styles.forgotWrap}>
            <Text style={[styles.forgot, { color: colors.primary }]}>Forgot password?</Text>
          </Pressable>
        </Link>
        <Pressable
          style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonDisabled]}
          onPress={() => {
            void hapticImpact("light");
            void emailLogin();
          }}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.line} />
        </View>

        {googleConfigured ? (
          <GoogleSignInButton colors={colors} />
        ) : (
          <Pressable
            style={[
              styles.altButton,
              { borderColor: colors.border, backgroundColor: colors.background },
              styles.altButtonDisabled,
            ]}
            disabled
          >
            <Ionicons name="logo-google" size={20} color="#1e293b" />
            <Text style={[styles.altButtonText, { color: colors.text }]}>
              Google (set OAuth client ID in .env)
            </Text>
          </Pressable>
        )}

        {Platform.OS === "ios" && appleAuth.isSupported ? (
          <AppleButton
            buttonType={AppleButton.Type.SIGN_IN}
            buttonStyle={AppleButton.Style.BLACK}
            cornerRadius={10}
            style={{ width: "100%", height: 48 }}
            onPress={onApple}
          />
        ) : null}

        <Link href="/(auth)/register" asChild>
          <Pressable style={styles.linkWrap}>
            <Text style={[styles.link, { color: colors.primary }]}>Create an account</Text>
          </Pressable>
        </Link>
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
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
  },
  forgotWrap: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center" },
  forgot: { fontSize: 13, fontWeight: "600" },
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
  altButtonDisabled: { opacity: 0.55 },
  altButtonText: { fontSize: 16, fontWeight: "600" },
  linkWrap: { paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  link: { textAlign: "center", fontSize: 15 },
});
