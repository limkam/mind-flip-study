import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Router } from "expo-router";

import { api } from "../api/client";
import { storage } from "../store/storage";

const PROMPTED_KEY = "push-registration-prompted";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function setupNotificationHandlers(router: Router) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    const screen = data?.screen;
    if (typeof screen === "string" && screen.length > 0) {
      router.push(screen as never);
    }
  });
  return () => sub.remove();
}

export async function registerForPushNotifications(): Promise<boolean> {
  if (!Device.isDevice) {
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
