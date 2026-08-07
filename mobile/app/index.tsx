import { Redirect } from "expo-router";
import { useAuthStore } from "../store/authStore";

export default function Index() {
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const user = useAuthStore((s) => s.user);

  if (bootstrapStatus === "authenticated") {
    if (user && user.onboarding_completed === false) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
