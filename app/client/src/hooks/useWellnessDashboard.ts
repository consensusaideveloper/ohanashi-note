import { useState, useEffect, useCallback } from "react";

import { getWellnessDashboard } from "../lib/wellness-api";

import type { WellnessDashboard } from "../lib/wellness-api";

interface UseWellnessDashboardReturn {
  dashboard: WellnessDashboard | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

export function useWellnessDashboard(
  creatorId: string,
): UseWellnessDashboardReturn {
  const [dashboard, setDashboard] = useState<WellnessDashboard | null>(null);
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
    getWellnessDashboard(creatorId)
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load wellness dashboard:", {
          error: err,
          creatorId,
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
  }, [creatorId, refreshKey]);

  return {
    dashboard,
    loading,
    error,
    refresh,
  };
}
