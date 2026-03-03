import { useState, useEffect, useCallback } from "react";

import { getFirebaseMessaging } from "../lib/firebase";
import { isIOSDevice } from "../lib/platform";
import { subscribePush } from "../lib/push-api";

interface UsePushNotificationReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  needsA2HS: boolean;
  requestPermission: () => Promise<boolean>;
  isRequesting: boolean;
}

type DeviceType = "ios" | "android" | "web";

function detectDeviceType(): DeviceType {
  if (isIOSDevice()) return "ios";
  if (
    typeof navigator !== "undefined" &&
    /Android/i.test(navigator.userAgent)
  ) {
    return "android";
  }
  return "web";
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function usePushNotification(
  onForegroundMessage?: (title: string, body: string) => void,
): UsePushNotificationReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [needsA2HS, setNeedsA2HS] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotification = "Notification" in window;
    const supported = hasSW && hasPush && hasNotification;
    setIsSupported(supported);

    if (hasNotification) {
      setPermission(Notification.permission);
    }

    // iOS requires standalone mode for push notifications
    if (isIOSDevice() && !isStandaloneMode()) {
      setNeedsA2HS(true);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setIsRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== "granted") {
        return false;
      }

      const messaging = await getFirebaseMessaging();
      if (messaging === null) {
        return false;
      }

      const swRegistration = await navigator.serviceWorker.ready;

      const { getToken, onMessage } = await import("firebase/messaging");
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as
        | string
        | undefined;

      const token = await getToken(messaging, {
        vapidKey: vapidKey ?? "",
        serviceWorkerRegistration: swRegistration,
      });

      const deviceType = detectDeviceType();
      await subscribePush(token, deviceType);

      // Set up foreground message handling
      if (onForegroundMessage !== undefined) {
        onMessage(messaging, (payload) => {
          const title =
            payload.notification?.title ?? "おはなしエンディングノート";
          const body = payload.notification?.body ?? "";
          onForegroundMessage(title, body);
        });
      }

      return true;
    } catch (error: unknown) {
      console.error("Failed to request push permission:", { error });
      return false;
    } finally {
      setIsRequesting(false);
    }
  }, [onForegroundMessage]);

  return {
    isSupported,
    permission,
    needsA2HS,
    requestPermission,
    isRequesting,
  };
}
