/**
 * Return route safety helper for Expo Router.
 *
 * Validates candidates to ensure they are relative internal Expo Router routes
 * and do not point to onboarding, auth, or unsafe protocol schemes.
 */
export function safeReturnRoute(
  candidate: string | null | undefined,
): string | null {
  if (!candidate || typeof candidate !== "string") return null;
  const trimmed = candidate.trim();

  // Normalize backslashes to forward slashes before any validation
  const normalized = trimmed.replace(/\\/g, "/");

  // Must start with '/' and not '//' (protocol-relative URL)
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }

  // Reject URLs containing encoded scheme delimiters or authority markers
  if (
    normalized.includes(":") ||
    normalized.toLowerCase().includes("%3a") ||
    normalized.toLowerCase().includes("%2f%2f")
  ) {
    return null;
  }

  // Extract path component before query or hash
  const pathOnly = normalized.split("?")[0].split("#")[0];

  // Exclude auth routes, onboarding itself, and root index loops
  if (
    pathOnly === "/onboarding" ||
    pathOnly.startsWith("/onboarding/") ||
    pathOnly === "/(auth)" ||
    pathOnly.startsWith("/(auth)/") ||
    pathOnly === "/login" ||
    pathOnly.startsWith("/login/") ||
    pathOnly === "/register" ||
    pathOnly.startsWith("/register/") ||
    pathOnly === "/verify-email" ||
    pathOnly.startsWith("/verify-email/") ||
    pathOnly === "/"
  ) {
    return null;
  }

  return normalized;
}
