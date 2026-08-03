import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuthStore } from "../store/authStore";

export default function Index() {
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const user = useAuthStore((s) => s.user);

  if (
    bootstrapStatus !== "authenticated"
    && bootstrapStatus !== "signed_out"
    && bootstrapStatus !== "terminated"
  ) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (bootstrapStatus === "authenticated") {
    if (user && user.onboarding_completed === false) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/(auth)/login" />;
}
