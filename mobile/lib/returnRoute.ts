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

  // Decode URI encoding safely for inspection (bounded single-pass)
  let decodedPath = pathOnly;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    return null;
  }

  // Reject decoded paths containing scheme delimiters or authority markers
  if (
    decodedPath.startsWith("//") ||
    decodedPath.includes(":") ||
    decodedPath.toLowerCase().includes("%3a") ||
    decodedPath.toLowerCase().includes("%2f%2f") ||
    pathOnly.toLowerCase().includes("%2f")
  ) {
    return null;
  }

  const isExcludedPath = (rawPath: string): boolean => {
    const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
    if (path === "/" || path === "") return true;

    const forbiddenPrefixes = [
      "/onboarding",
      "/(auth)",
      "/auth",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/change-password",
      "/verify-email",
    ];

    return forbiddenPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  };

  // Exclude auth/password routes, onboarding itself, and root index loops
  if (isExcludedPath(pathOnly) || isExcludedPath(decodedPath)) {
    return null;
  }

  return normalized;
}
