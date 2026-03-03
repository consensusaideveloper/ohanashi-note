// Push notification settings section for the Settings screen.
// Follows the same pattern as WellnessSettingsSection.

import { useState, useCallback, useMemo } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import { usePushNotification } from "../hooks/usePushNotification";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { NotificationPreferences } from "../lib/push-api";

const SECTION_TITLE = UI_MESSAGES.push.settingsTitle;
const SECTION_DESCRIPTION = UI_MESSAGES.push.settingsDescription;

interface ToggleOption {
  key: keyof NotificationPreferences;
  label: string;
}

const TOGGLE_OPTIONS: readonly ToggleOption[] = [
  { key: "pushWellness", label: UI_MESSAGES.push.wellnessLabel },
  { key: "pushMilestones", label: UI_MESSAGES.push.milestonesLabel },
  { key: "pushFamily", label: UI_MESSAGES.push.familyLabel },
] as const;

export function PushNotificationSettings(): ReactNode {
  const { preferences, loading, error, updatePreferences, refresh } =
    useNotificationPreferences();
  const { isSupported, permission, requestPermission, isRequesting } =
    usePushNotification();
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const [localPrefs, setLocalPrefs] =
    useState<Partial<NotificationPreferences> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Merge local overrides with server preferences
  const displayPrefs: NotificationPreferences = useMemo(
    () => ({
      pushEnabled: localPrefs?.pushEnabled ?? preferences?.pushEnabled ?? true,
      pushWellness:
        localPrefs?.pushWellness ?? preferences?.pushWellness ?? true,
      pushMilestones:
        localPrefs?.pushMilestones ?? preferences?.pushMilestones ?? true,
      pushFamily: localPrefs?.pushFamily ?? preferences?.pushFamily ?? true,
    }),
    [localPrefs, preferences],
  );

  const hasUnsavedChanges = useMemo((): boolean => {
    if (preferences === null || localPrefs === null) return false;
    return (
      (localPrefs.pushEnabled !== undefined &&
        localPrefs.pushEnabled !== preferences.pushEnabled) ||
      (localPrefs.pushWellness !== undefined &&
        localPrefs.pushWellness !== preferences.pushWellness) ||
      (localPrefs.pushMilestones !== undefined &&
        localPrefs.pushMilestones !== preferences.pushMilestones) ||
      (localPrefs.pushFamily !== undefined &&
        localPrefs.pushFamily !== preferences.pushFamily)
    );
  }, [preferences, localPrefs]);

  const handleToggleEnabled = useCallback((): void => {
    setLocalPrefs((prev) => ({
      ...prev,
      pushEnabled: !displayPrefs.pushEnabled,
    }));
  }, [displayPrefs.pushEnabled]);

  const handleToggleCategory = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const key = e.currentTarget.dataset["prefKey"] as
        | keyof NotificationPreferences
        | undefined;
      if (key !== undefined) {
        setLocalPrefs((prev) => ({
          ...prev,
          [key]: !displayPrefs[key],
        }));
      }
    },
    [displayPrefs],
  );

  const handleSave = useCallback((): void => {
    setIsSaving(true);
    void updatePreferences(displayPrefs)
      .then(() => {
        setLocalPrefs(null);
        showToast(UI_MESSAGES.push.saved, "success");
      })
      .catch(() => {
        showToast(UI_MESSAGES.push.saveFailed, "error");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [displayPrefs, updatePreferences, showToast]);

  const handleRequestPermission = useCallback((): void => {
    void requestPermission();
  }, [requestPermission]);

  const handleRetry = useCallback((): void => {
    refresh();
  }, [refresh]);

  // Loading state
  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <div className="bg-bg-surface rounded-card border border-border-light p-4">
          <p className="text-lg text-text-secondary">読み込み中...</p>
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <div className="bg-bg-surface rounded-card border border-border-light p-4 space-y-3">
          <p className="text-lg text-text-secondary">
            {UI_MESSAGES.push.loadFailed}
          </p>
          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleRetry}
          >
            もう一度読み込む
          </button>
        </div>
      </section>
    );
  }

  // Not supported
  if (!isSupported) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <p className="text-lg text-text-secondary">{SECTION_DESCRIPTION}</p>
        <div className="bg-bg-surface rounded-card border border-border-light p-4">
          <p className="text-lg text-text-secondary">
            {UI_MESSAGES.push.notSupported}
          </p>
        </div>
      </section>
    );
  }

  // Permission denied
  if (permission === "denied") {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <p className="text-lg text-text-secondary">{SECTION_DESCRIPTION}</p>
        <div className="bg-bg-surface rounded-card border border-border-light p-4">
          <p className="text-lg text-text-secondary">
            {UI_MESSAGES.push.permissionDenied}
          </p>
        </div>
      </section>
    );
  }

  // Permission not yet granted — show request button
  if (permission !== "granted") {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <p className="text-lg text-text-secondary">{SECTION_DESCRIPTION}</p>
        <button
          type="button"
          disabled={isRequesting}
          className="w-full bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg"
          onClick={handleRequestPermission}
        >
          {isRequesting
            ? "設定しています..."
            : UI_MESSAGES.push.permissionAllow}
        </button>
      </section>
    );
  }

  // Permission granted — show full settings
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-secondary">
        {SECTION_TITLE}
      </h2>
      <p className="text-lg text-text-secondary">{SECTION_DESCRIPTION}</p>

      {/* Master toggle */}
      <div className="flex gap-2" role="radiogroup" aria-label={SECTION_TITLE}>
        <button
          type="button"
          role="radio"
          aria-checked={displayPrefs.pushEnabled}
          className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
            displayPrefs.pushEnabled
              ? "bg-accent-primary text-text-on-accent shadow-sm"
              : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
          }`}
          onClick={handleToggleEnabled}
        >
          有効
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!displayPrefs.pushEnabled}
          className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
            !displayPrefs.pushEnabled
              ? "bg-accent-primary text-text-on-accent shadow-sm"
              : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
          }`}
          onClick={handleToggleEnabled}
        >
          無効
        </button>
      </div>

      {/* Category toggles (visible when enabled) */}
      {displayPrefs.pushEnabled && (
        <div className="space-y-2 pt-2">
          {TOGGLE_OPTIONS.map((opt) => {
            const isOn = displayPrefs[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                data-pref-key={opt.key}
                className={`w-full rounded-card border px-4 py-3 text-left transition-colors flex items-center justify-between min-h-11 ${
                  isOn
                    ? "border-accent-primary bg-accent-primary-light"
                    : "border-border-light bg-bg-surface"
                }`}
                onClick={handleToggleCategory}
              >
                <span className="text-lg text-text-primary">{opt.label}</span>
                {/* Check/uncheck indicator */}
                <svg
                  className={`w-6 h-6 flex-shrink-0 ${isOn ? "text-accent-primary" : "text-text-secondary"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  {isOn ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  ) : (
                    <circle cx="12" cy="12" r="9" />
                  )}
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {/* Save button */}
      <div className="pt-2">
        {hasUnsavedChanges && (
          <p
            className="text-lg text-warning font-medium mb-2"
            role="status"
            aria-live="polite"
          >
            変更が保存されていません
          </p>
        )}
        <button
          type="button"
          disabled={!hasUnsavedChanges || isSaving}
          className={`w-full rounded-full min-h-11 px-6 text-lg transition-colors ${
            hasUnsavedChanges
              ? "bg-accent-primary text-text-on-accent shadow-sm"
              : "bg-bg-surface text-text-secondary border border-border cursor-default"
          }`}
          onClick={handleSave}
        >
          保存する
        </button>
      </div>

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </section>
  );
}
