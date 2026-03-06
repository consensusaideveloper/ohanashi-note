import { useState, useCallback, useEffect } from "react";

import {
  getWellnessSettings,
  updateWellnessSettings,
  pauseWellness,
  resumeWellness,
  getWellnessOwnerStatus,
} from "../lib/wellness-api";

import type {
  WellnessSettings,
  WellnessShareLevel,
  WellnessOwnerStatus,
} from "../lib/wellness-api";

// --- Constants ---

const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_WEEKLY_SUMMARY_DAY = 0;
const DEFAULT_CONSENT_VERSION = "2026-03-v1";
const DEFAULT_ESCALATION_RULE: Record<string, string> = {
  day2: "warn",
  day3: "urgent",
};

// --- Types ---

interface UseWellnessSettingsReturn {
  settings: WellnessSettings | null;
  ownerStatus: WellnessOwnerStatus | null;
  isLoading: boolean;
  error: boolean;
  isSaving: boolean;
  refresh: () => void;
  activate: (shareLevel: WellnessShareLevel) => Promise<void>;
  updateShareLevel: (shareLevel: WellnessShareLevel) => Promise<void>;
  updateDeliveryDay: (day: number) => Promise<void>;
  pause: (pausedUntil: string) => Promise<void>;
  resume: () => Promise<void>;
  disable: () => Promise<void>;
}

// --- Hook ---

export function useWellnessSettings(): UseWellnessSettingsReturn {
  const [settings, setSettings] = useState<WellnessSettings | null>(null);
  const [ownerStatus, setOwnerStatus] = useState<WellnessOwnerStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback((): void => {
    setIsLoading(true);
    setError(false);

    Promise.all([getWellnessSettings(), getWellnessOwnerStatus()])
      .then(([settingsResult, statusResult]) => {
        setSettings(settingsResult);
        setOwnerStatus(statusResult);
      })
      .catch((err: unknown) => {
        console.error("Failed to load wellness settings:", { error: err });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activate = useCallback(
    async (shareLevel: WellnessShareLevel): Promise<void> => {
      setIsSaving(true);
      try {
        const result = await updateWellnessSettings({
          enabled: true,
          shareLevel,
          timezone: DEFAULT_TIMEZONE,
          weeklySummaryDay: DEFAULT_WEEKLY_SUMMARY_DAY,
          escalationRule: DEFAULT_ESCALATION_RULE,
          consentVersion: DEFAULT_CONSENT_VERSION,
        });
        setSettings(result);
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const updateShareLevel = useCallback(
    async (shareLevel: WellnessShareLevel): Promise<void> => {
      setIsSaving(true);
      try {
        const result = await updateWellnessSettings({ shareLevel });
        setSettings(result);
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const updateDeliveryDay = useCallback(async (day: number): Promise<void> => {
    setIsSaving(true);
    try {
      const result = await updateWellnessSettings({ weeklySummaryDay: day });
      setSettings(result);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const pause = useCallback(async (pausedUntil: string): Promise<void> => {
    setIsSaving(true);
    try {
      await pauseWellness(pausedUntil);
      setSettings((prev) => (prev !== null ? { ...prev, pausedUntil } : prev));
    } finally {
      setIsSaving(false);
    }
  }, []);

  const resume = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    try {
      await resumeWellness();
      setSettings((prev) =>
        prev !== null ? { ...prev, pausedUntil: null } : prev,
      );
    } finally {
      setIsSaving(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    try {
      const result = await updateWellnessSettings({ enabled: false });
      setSettings(result);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    settings,
    ownerStatus,
    isLoading,
    error,
    isSaving,
    refresh: loadData,
    activate,
    updateShareLevel,
    updateDeliveryDay,
    pause,
    resume,
    disable,
  };
}
