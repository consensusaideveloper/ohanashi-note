import { useState, useEffect, useCallback } from "react";

import {
  getWellnessSettings,
  updateWellnessSettings,
} from "../lib/wellness-api";

import type {
  WellnessSettings,
  UpdateWellnessSettingsRequest,
} from "../lib/wellness-api";

interface UseWellnessSettingsReturn {
  settings: WellnessSettings | null;
  loading: boolean;
  error: boolean;
  updateSettings: (
    data: UpdateWellnessSettingsRequest,
  ) => Promise<WellnessSettings>;
  refresh: () => void;
}

export function useWellnessSettings(): UseWellnessSettingsReturn {
  const [settings, setSettings] = useState<WellnessSettings | null>(null);
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
    getWellnessSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load wellness settings:", { error: err });
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

  const handleUpdateSettings = useCallback(
    async (data: UpdateWellnessSettingsRequest): Promise<WellnessSettings> => {
      setError(false);
      try {
        const updated = await updateWellnessSettings(data);
        setSettings(updated);
        return updated;
      } catch (err: unknown) {
        console.error("Failed to update wellness settings:", {
          error: err,
          data,
        });
        setError(true);
        throw err;
      }
    },
    [],
  );

  return {
    settings,
    loading,
    error,
    updateSettings: handleUpdateSettings,
    refresh,
  };
}
