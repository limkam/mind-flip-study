import { useRouter } from "expo-router";
import { Alert } from "react-native";

import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const performLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* refresh cookie may be absent on native */
    }
    logout();
    router.replace("/(auth)/login");
  };

  const confirmLogout = () => {
    Alert.alert("Log out?", "End your session on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void performLogout() },
    ]);
  };

  return { confirmLogout };
}
