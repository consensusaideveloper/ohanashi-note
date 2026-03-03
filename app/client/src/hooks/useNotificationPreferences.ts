import { useState, useEffect, useCallback } from "react";

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../lib/push-api";

import type { NotificationPreferences } from "../lib/push-api";

interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences | null;
  loading: boolean;
  error: boolean;
  updatePreferences: (
    prefs: NotificationPreferences,
  ) => Promise<NotificationPreferences>;
  refresh: () => void;
}

export function useNotificationPreferences(): UseNotificationPreferencesReturn {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(false);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getNotificationPreferences()
      .then((data) => {
        if (cancelled) return;
        setPreferences(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load notification preferences:", {
          error: err,
        });
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleUpdatePreferences = useCallback(
    async (
      prefs: NotificationPreferences,
    ): Promise<NotificationPreferences> => {
      setError(false);
      try {
        const updated = await updateNotificationPreferences(prefs);
        setPreferences(updated);
        return updated;
      } catch (err: unknown) {
        console.error("Failed to update notification preferences:", {
          error: err,
          prefs,
        });
        setError(true);
        throw err;
      }
    },
    [],
  );

  return {
    preferences,
    loading,
    error,
    updatePreferences: handleUpdatePreferences,
    refresh,
  };
}
