import * as SecureStore from "expo-secure-store";

const NATIVE_REFRESH_TOKEN_KEY = "mindflip_native_refresh_token";

let ephemeralNativeRefreshToken: string | null = null;

/**
 * Stores a native refresh credential.
 * If persistent is true (keepSignedIn === true), writes to SecureStore and holds in memory.
 * If persistent is false (keepSignedIn === false), holds in memory ONLY and clears SecureStore.
 */
export async function setNativeRefreshToken(
  token: string,
  options?: { persistent?: boolean },
): Promise<boolean> {
  const isPersistent = options?.persistent ?? true;
  ephemeralNativeRefreshToken = token;

  if (!isPersistent) {
    try {
      await SecureStore.deleteItemAsync(NATIVE_REFRESH_TOKEN_KEY);
    } catch {
      /* non-fatal */
    }
    return true;
  }

  try {
    await SecureStore.setItemAsync(NATIVE_REFRESH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    return true;
  } catch {
    ephemeralNativeRefreshToken = null;
    return false;
  }
}

/**
 * Retrieves the native refresh credential.
 * First checks in-memory copy. If empty, attempts to read from SecureStore.
 */
export async function getNativeRefreshToken(): Promise<string | null> {
  if (ephemeralNativeRefreshToken) {
    return ephemeralNativeRefreshToken;
  }
  try {
    const value = await SecureStore.getItemAsync(NATIVE_REFRESH_TOKEN_KEY);
    if (value) {
      ephemeralNativeRefreshToken = value;
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clears native refresh credentials from both memory and SecureStore.
 */
export async function clearNativeRefreshToken(): Promise<void> {
  ephemeralNativeRefreshToken = null;
  try {
    await SecureStore.deleteItemAsync(NATIVE_REFRESH_TOKEN_KEY);
  } catch {
    /* ignore deletion errors during signout */
  }
}
