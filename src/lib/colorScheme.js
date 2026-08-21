import { useEffect } from "react";

const VALID_SCHEMES = new Set(["light", "dark", "system"]);

export function normalizeColorScheme(value) {
  return VALID_SCHEMES.has(value) ? value : "system";
}

export function colorSchemeStorageKey(userId) {
  return `bilkeys:color-scheme:${userId}`;
}

export function readColorScheme(user) {
  const backend = normalizeColorScheme(user?.preferences?.color_scheme);
  if (!user?.id || typeof window === "undefined") return backend;
  return normalizeColorScheme(localStorage.getItem(colorSchemeStorageKey(user.id)) || backend);
}

export function applyColorScheme(preference) {
  if (typeof window === "undefined") return;
  const scheme = normalizeColorScheme(preference);
  const dark = scheme === "dark" || (
    scheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function persistColorScheme(userId, preference) {
  if (!userId || typeof window === "undefined") return;
  localStorage.setItem(colorSchemeStorageKey(userId), normalizeColorScheme(preference));
}

// For standalone routes outside AppLayout (e.g. public billing pages) that
// still need to render in the user's actual theme rather than the default.
export function useApplyColorScheme(user) {
  useEffect(() => {
    applyColorScheme(readColorScheme(user));
  }, [user?.id, user?.preferences?.color_scheme]);
}
