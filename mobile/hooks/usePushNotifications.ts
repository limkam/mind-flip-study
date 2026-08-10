import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Router } from "expo-router";

import { api } from "../api/client";
import { storage } from "../store/storage";

const PROMPTED_KEY = "push-registration-prompted";
const isExpoGo = Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
type NotificationsModule = typeof import("expo-notifications");
let notificationsPromise: Promise<NotificationsModule> | null = null;
let handlerConfigured = false;

async function loadNotifications(): Promise<NotificationsModule | null> {
  // SDK 53+ throws while evaluating expo-notifications inside Expo Go on Android.
  // Development and production builds still load the native module normally.
  if (isExpoGo) return null;
  notificationsPromise ??= import("expo-notifications");
  const Notifications = await notificationsPromise;
  if (!handlerConfigured) {
    handlerConfigured = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return Notifications;
}

export function setupNotificationHandlers(router: Router) {
  let disposed = false;
  let removeListener: (() => void) | undefined;
  void loadNotifications().then((Notifications) => {
    if (!Notifications || disposed) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const screen = data?.screen;
      if (typeof screen === "string" && screen.length > 0) router.push(screen as never);
    });
    removeListener = () => sub.remove();
  }).catch(() => undefined);
  return () => { disposed = true; removeListener?.(); };
}

export async function registerForPushNotifications(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Device.isDevice || !Notifications) {
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return false;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenResponse.data;
  if (!token) {
    return false;
  }

  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.post("/users/me/push-token", { token, platform });
  return true;
}

/** Call after the user completes their first study session (not on cold start). */
export async function maybeRegisterPushAfterStudy(): Promise<void> {
  if (storage.getBoolean(PROMPTED_KEY)) {
    return;
  }
  storage.set(PROMPTED_KEY, true);
  try {
    await registerForPushNotifications();
  } catch {
    /* permissions denied or API offline */
  }
}
