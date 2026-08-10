import { Redirect } from "expo-router";

export default function ForgotPasswordRedirect() {
  return <Redirect href="/(auth)/login" />;
}
