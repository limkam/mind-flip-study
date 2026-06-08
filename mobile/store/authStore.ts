import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type User = {
  id: string;
  email: string;
  role: "admin" | "student";
  full_name: string;
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

type AuthState = {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
};

const AUTH_PREFIX = "@mindflip-auth:";

const authStorage = {
  getItem: async (name: string) =>
    (await AsyncStorage.getItem(AUTH_PREFIX + name)) ?? null,
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
      setAuth: (user, token) => set({ user, accessToken: token }),
      setAccessToken: (token) => set({ accessToken: token }),
      logout: () => set({ user: null, accessToken: null }),
    }),
    {
      name: "mindflip-auth",
      storage: createJSONStorage(() => authStorage),
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    },
  ),
);
