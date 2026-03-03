import { useState, useEffect, useCallback } from "react";

import { fetchWithAuth } from "../lib/api";

import type { QuestionCategory } from "../types/conversation";

interface CategoryProgress {
  id: QuestionCategory;
  label: string;
  answered: number;
  total: number;
  percentage: number;
}

interface OverallProgress {
  answered: number;
  total: number;
  percentage: number;
}

interface MilestoneProgress {
  id: string;
  label: string;
  achieved: boolean;
  achievedDate: string | null;
}

export interface ProgressData {
  categories: CategoryProgress[];
  overall: OverallProgress;
  milestones: MilestoneProgress[];
}

interface UseProgressReturn {
  data: ProgressData | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

export function useProgress(): UseProgressReturn {
  const [data, setData] = useState<ProgressData | null>(null);
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
    fetchWithAuth("/api/progress")
      .then((response) => response.json() as Promise<ProgressData>)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load progress:", { error: err });
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

  return {
    data,
    loading,
    error,
    refresh,
  };
}
