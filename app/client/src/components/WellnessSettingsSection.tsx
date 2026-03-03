import { useState, useCallback, useMemo } from "react";

import {
  UI_MESSAGES,
  WELLNESS_FREQUENCY_OPTIONS,
  WELLNESS_SHARING_OPTIONS,
} from "../lib/constants";
import { useWellnessSettings } from "../hooks/useWellnessSettings";
import { useToast } from "../hooks/useToast";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type {
  UpdateWellnessSettingsRequest,
  WellnessSettings,
} from "../lib/wellness-api";

interface WellnessSettingsSectionProps {
  onNavigateToPreview: () => void;
}

const SECTION_TITLE = "見守り";
const SECTION_DESCRIPTION = "ご家族にお元気な様子を伝える機能です";
const ENABLE_BUTTON_ON = "有効";
const ENABLE_BUTTON_OFF = "無効";
const FREQUENCY_LABEL = "通知の頻度";
const FREQUENCY_ARIA_LABEL = "通知の頻度";
const SHARING_LEVEL_LABEL = "家族に共有する情報";
const PREVIEW_BUTTON_LABEL = "家族に見える情報を確認する";
const SAVE_BUTTON_LABEL = "保存する";
const NO_FAMILY_MESSAGE = "ご家族を登録すると、見守り機能をお使いいただけます";
const DISABLE_CONFIRM_TITLE = "見守りを無効にする";
const DISABLE_CONFIRM_MESSAGE =
  "見守りを無効にすると、ご家族への情報共有が停止されます。よろしいですか？";
const DISABLE_CONFIRM_LABEL = "無効にする";
const DISABLE_CANCEL_LABEL = "もどる";
const LOADING_TEXT = "読み込み中...";
const ERROR_TEXT = UI_MESSAGES.wellness.loadFailed;
const RETRY_LABEL = "もう一度読み込む";

function getInitialFrequency(
  settings: WellnessSettings,
): UpdateWellnessSettingsRequest["frequency"] {
  return settings.frequency;
}

function getInitialSharingLevel(
  settings: WellnessSettings,
): UpdateWellnessSettingsRequest["sharingLevel"] {
  return settings.sharingLevel;
}

export function WellnessSettingsSection({
  onNavigateToPreview,
}: WellnessSettingsSectionProps): ReactNode {
  const { settings, loading, error, updateSettings, refresh } =
    useWellnessSettings();
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  const [localFrequency, setLocalFrequency] = useState<
    UpdateWellnessSettingsRequest["frequency"] | null
  >(null);
  const [localSharingLevel, setLocalSharingLevel] = useState<
    UpdateWellnessSettingsRequest["sharingLevel"] | null
  >(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Derive displayed values from local overrides or server settings
  const enabled = localEnabled ?? settings?.enabled ?? false;
  const frequency =
    localFrequency ??
    (settings !== null ? getInitialFrequency(settings) : "daily");
  const sharingLevel =
    localSharingLevel ??
    (settings !== null ? getInitialSharingLevel(settings) : "activity_only");

  const hasUnsavedChanges = useMemo((): boolean => {
    if (settings === null) {
      return false;
    }
    return (
      (localEnabled !== null && localEnabled !== settings.enabled) ||
      (localFrequency !== null && localFrequency !== settings.frequency) ||
      (localSharingLevel !== null &&
        localSharingLevel !== settings.sharingLevel)
    );
  }, [settings, localEnabled, localFrequency, localSharingLevel]);

  const handleEnable = useCallback((): void => {
    if (!enabled) {
      setLocalEnabled(true);
    }
  }, [enabled]);

  const handleDisable = useCallback((): void => {
    if (enabled) {
      setShowDisableConfirm(true);
    }
  }, [enabled]);

  const handleDisableConfirm = useCallback((): void => {
    setShowDisableConfirm(false);
    setLocalEnabled(false);
  }, []);

  const handleDisableCancel = useCallback((): void => {
    setShowDisableConfirm(false);
  }, []);

  const handleFrequencyChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const value = e.currentTarget.dataset["frequency"] as
        | UpdateWellnessSettingsRequest["frequency"]
        | undefined;
      if (value !== undefined) {
        setLocalFrequency(value);
      }
    },
    [],
  );

  const handleSharingLevelChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const value = e.currentTarget.dataset["sharingLevel"] as
        | UpdateWellnessSettingsRequest["sharingLevel"]
        | undefined;
      if (value !== undefined) {
        setLocalSharingLevel(value);
      }
    },
    [],
  );

  const handleSave = useCallback((): void => {
    setIsSaving(true);
    void updateSettings({
      enabled,
      frequency,
      sharingLevel,
    })
      .then(() => {
        setLocalEnabled(null);
        setLocalFrequency(null);
        setLocalSharingLevel(null);
        showToast(UI_MESSAGES.wellness.saved, "success");
      })
      .catch(() => {
        showToast(UI_MESSAGES.wellness.saveFailed, "error");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [enabled, frequency, sharingLevel, updateSettings, showToast]);

  const handleRetry = useCallback((): void => {
    refresh();
  }, [refresh]);

  const handlePreviewClick = useCallback((): void => {
    onNavigateToPreview();
  }, [onNavigateToPreview]);

  // Loading state
  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <div className="bg-bg-surface rounded-card border border-border-light p-4">
          <p className="text-lg text-text-secondary">{LOADING_TEXT}</p>
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
          <p className="text-lg text-text-secondary">{ERROR_TEXT}</p>
          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleRetry}
          >
            {RETRY_LABEL}
          </button>
        </div>
      </section>
    );
  }

  // No family members
  if (settings !== null && !settings.hasFamilyMembers) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {SECTION_TITLE}
        </h2>
        <p className="text-lg text-text-secondary">{SECTION_DESCRIPTION}</p>
        <div className="bg-bg-surface rounded-card border border-border-light p-4">
          <p className="text-lg text-text-secondary">{NO_FAMILY_MESSAGE}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-secondary">
        {SECTION_TITLE}
      </h2>
      <p className="text-lg text-text-secondary">{SECTION_DESCRIPTION}</p>

      {/* Enable/disable toggle — button-style like radiogroup */}
      <div className="flex gap-2" role="radiogroup" aria-label={SECTION_TITLE}>
        <button
          type="button"
          role="radio"
          aria-checked={enabled}
          className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
            enabled
              ? "bg-accent-primary text-text-on-accent shadow-sm"
              : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
          }`}
          onClick={handleEnable}
        >
          {ENABLE_BUTTON_ON}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!enabled}
          className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
            !enabled
              ? "bg-accent-primary text-text-on-accent shadow-sm"
              : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
          }`}
          onClick={handleDisable}
        >
          {ENABLE_BUTTON_OFF}
        </button>
      </div>

      {/* When enabled, show frequency and sharing level options */}
      {enabled && (
        <div className="space-y-4 pt-2">
          {/* Frequency picker */}
          <div className="space-y-2">
            <p className="text-lg text-text-primary">{FREQUENCY_LABEL}</p>
            <div
              className="flex gap-2"
              role="radiogroup"
              aria-label={FREQUENCY_ARIA_LABEL}
            >
              {WELLNESS_FREQUENCY_OPTIONS.map((option) => {
                const isActive = frequency === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    data-frequency={option.value}
                    className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
                      isActive
                        ? "bg-accent-primary text-text-on-accent shadow-sm"
                        : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                    }`}
                    onClick={handleFrequencyChange}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sharing level picker — card style */}
          <div className="space-y-2">
            <p className="text-lg text-text-primary">{SHARING_LEVEL_LABEL}</p>
            <div className="space-y-2">
              {WELLNESS_SHARING_OPTIONS.map((option) => {
                const isActive = sharingLevel === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-sharing-level={option.value}
                    className={`w-full rounded-card border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-accent-primary bg-accent-primary-light"
                        : "border-border-light bg-bg-surface"
                    }`}
                    onClick={handleSharingLevelChange}
                  >
                    <p className="text-lg font-medium text-text-primary">
                      {option.label}
                    </p>
                    <p className="text-lg text-text-secondary">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview button */}
          <button
            type="button"
            className="w-full bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg"
            onClick={handlePreviewClick}
          >
            {PREVIEW_BUTTON_LABEL}
          </button>
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
          {SAVE_BUTTON_LABEL}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showDisableConfirm}
        title={DISABLE_CONFIRM_TITLE}
        message={DISABLE_CONFIRM_MESSAGE}
        confirmLabel={DISABLE_CONFIRM_LABEL}
        cancelLabel={DISABLE_CANCEL_LABEL}
        variant="danger"
        onConfirm={handleDisableConfirm}
        onCancel={handleDisableCancel}
      />
      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </section>
  );
}
