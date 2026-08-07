import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { clearMobileQueryCache } from "../lib/queryClient";

export type User = {
  id: string;
  email: string;
  role: "admin" | "student";
  full_name: string;
  avatar_url?: string | null;
  auth_provider?: string;
  is_banned?: boolean;
  subscription_tier?: string;
  preferences?: Record<string, unknown>;
  date_of_birth?: string | null;
  age?: number | null;
  country?: string | null;
  custom_country?: string | null;
  continent?: string | null;
  occupation?: string | null;
  job_title?: string | null;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AuthBootstrapStatus =
  | "hydrating"
  | "validating"
  | "authenticated"
  | "signed_out"
  | "terminated"
  | "error";

type AuthState = {
  user: User | null;
  accessToken: string | null;
  keepSignedIn: boolean;
  bootstrapStatus: AuthBootstrapStatus;
  bootstrapError: string | null;
  authGeneration: number;
  setKeepSignedIn: (value: boolean) => void;
  setAuth: (user: User, token: string) => void;
  setAccessToken: (token: string) => void;
  finishAuthStorageHydration: () => void;
  setValidatedUser: (user: User) => void;
  setBootstrapError: (message: string) => void;
  retryAuthBootstrap: () => void;
  terminateAuthSession: () => void;
  logout: () => void;
};

const AUTH_PREFIX = "@mindflip-auth:";

const authStorage = {
  getItem: async (name: string) => {
    const raw = await AsyncStorage.getItem(AUTH_PREFIX + name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.state) {
        if ("accessToken" in parsed.state || "refreshToken" in parsed.state) {
          delete parsed.state.accessToken;
          delete parsed.state.refreshToken;
          const cleaned = JSON.stringify(parsed);
          await AsyncStorage.setItem(AUTH_PREFIX + name, cleaned);
          return cleaned;
        }
      }
    } catch {
      /* ignore JSON parse error */
    }
    return raw;
  },
  setItem: async (name: string, value: string) => {
    await AsyncStorage.setItem(AUTH_PREFIX + name, value);
  },
  removeItem: async (name: string) => {
    await AsyncStorage.removeItem(AUTH_PREFIX + name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      keepSignedIn: true,
      bootstrapStatus: "hydrating",
      bootstrapError: null,
      authGeneration: 1,
      setKeepSignedIn: (value) => set({ keepSignedIn: value }),
      setAuth: (user, token) =>
        set((state) => {
          if (state.user?.id && state.user.id !== user.id) {
            clearMobileQueryCache();
          }
          return {
            user,
            accessToken: token,
            bootstrapStatus: "authenticated",
            bootstrapError: null,
            authGeneration: state.authGeneration + 1,
          };
        }),
      setAccessToken: (token) => set({ accessToken: token }),
      finishAuthStorageHydration: () =>
        set({
          bootstrapStatus: "validating",
          bootstrapError: null,
        }),
      setValidatedUser: (user) =>
        set((state) => {
          if (!state.accessToken) return state;
          if (state.user?.id && state.user.id !== user.id) {
            clearMobileQueryCache();
          }
          return {
            user,
            bootstrapStatus: "authenticated",
            bootstrapError: null,
          };
        }),
      setBootstrapError: (message) =>
        set({ bootstrapStatus: "error", bootstrapError: message }),
      retryAuthBootstrap: () =>
        set({
          bootstrapStatus: "validating",
          bootstrapError: null,
        }),
      terminateAuthSession: () =>
        set((state) => ({
          user: null,
          accessToken: null,
          bootstrapStatus: "terminated",
          bootstrapError: null,
          authGeneration: state.authGeneration + 1,
        })),
      logout: () =>
        set((state) => ({
          user: null,
          accessToken: null,
          bootstrapStatus: "signed_out",
          bootstrapError: null,
          authGeneration: state.authGeneration + 1,
        })),
    }),
    {
      name: "mindflip-auth",
      storage: createJSONStorage(() => authStorage),
      partialize: (s) =>
        s.keepSignedIn
          ? { user: s.user, keepSignedIn: s.keepSignedIn }
          : { keepSignedIn: false },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          state?.setBootstrapError("Could not read the saved session on this device.");
          return;
        }
        state?.finishAuthStorageHydration();
      },
    },
  ),
);
