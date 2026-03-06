import { useState, useCallback, useEffect } from "react";

import { getWellnessFamilySummary } from "../lib/wellness-api";

import type { WellnessFamilySummary } from "../lib/wellness-api";

// --- Types ---

interface UseWellnessSummaryReturn {
  summary: WellnessFamilySummary | null;
  isLoading: boolean;
  error: boolean;
  refresh: () => void;
}

// --- Hook ---

export function useWellnessSummary(
  creatorId: string | null,
): UseWellnessSummaryReturn {
  const [summary, setSummary] = useState<WellnessFamilySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadData = useCallback((): void => {
    if (creatorId === null) {
      setSummary(null);
      setIsLoading(false);
      setError(false);
      return;
    }

    setIsLoading(true);
    setError(false);

    getWellnessFamilySummary(creatorId)
      .then((result) => {
        setSummary(result);
      })
      .catch((err: unknown) => {
        console.error("Failed to load wellness summary:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    summary,
    isLoading,
    error,
    refresh: loadData,
  };
}
