import { fetchWithAuth } from "./api";

export interface NotificationPreferences {
  pushEnabled: boolean;
  pushWellness: boolean;
  pushMilestones: boolean;
  pushFamily: boolean;
}

interface SubscribePushResponse {
  id: string;
  fcmToken: string;
}

export async function subscribePush(
  fcmToken: string,
  deviceType: string,
): Promise<SubscribePushResponse> {
  const response = await fetchWithAuth("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ fcmToken, deviceType }),
  });
  return response.json() as Promise<SubscribePushResponse>;
}

export async function unsubscribePush(fcmToken: string): Promise<void> {
  await fetchWithAuth("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ fcmToken }),
  });
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await fetchWithAuth("/api/push/preferences");
  return response.json() as Promise<NotificationPreferences>;
}

export async function updateNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  const response = await fetchWithAuth("/api/push/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
  return response.json() as Promise<NotificationPreferences>;
}
