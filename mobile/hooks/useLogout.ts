import { useRouter } from "expo-router";
import { Alert } from "react-native";

import { api } from "../api/client";
import { clearNativeRefreshToken, getNativeRefreshToken } from "../lib/nativeSession";
import { clearMobileQueryCache } from "../lib/queryClient";
import { useAuthStore } from "../store/authStore";

export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const performLogout = async () => {
    const refreshToken = await getNativeRefreshToken();
    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      } else {
        await api.post("/auth/logout");
      }
    } catch {
      /* server revocation is best-effort; local logout remains authoritative */
    } finally {
      await clearNativeRefreshToken();
    }

    const sessionAlreadyTerminated =
      useAuthStore.getState().user === null
      && useAuthStore.getState().accessToken === null;
    clearMobileQueryCache();
    logout();
    if (!sessionAlreadyTerminated) {
      router.replace("/(auth)/login");
    }
  };

  const confirmLogout = () => {
    Alert.alert("Log out?", "Sign out of Bilkeys on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void performLogout() },
    ]);
  };

  return { confirmLogout };
}
