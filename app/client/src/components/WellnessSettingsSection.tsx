import { useState, useCallback } from "react";

import { WELLNESS_MESSAGES } from "../lib/constants";
import { useWellnessSettings } from "../hooks/useWellnessSettings";
import { useToast } from "../hooks/useToast";
import { WellnessActivationDialog } from "./WellnessActivationDialog";
import { WellnessShareLevelBadge } from "./WellnessStatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { WellnessShareLevel } from "../lib/wellness-api";

// --- Constants ---

const SHARE_LEVELS: readonly {
  value: WellnessShareLevel;
  label: string;
}[] = [
  { value: "basic", label: WELLNESS_MESSAGES.shareLevel.basic },
  { value: "summary", label: WELLNESS_MESSAGES.shareLevel.summary },
  { value: "detailed", label: WELLNESS_MESSAGES.shareLevel.detailed },
];

const SHARE_LEVEL_INFO: Record<WellnessShareLevel, string> = {
  basic: WELLNESS_MESSAGES.settings.shareLevelBasicInfo,
  summary: WELLNESS_MESSAGES.settings.shareLevelSummaryInfo,
  detailed: WELLNESS_MESSAGES.settings.shareLevelDetailedInfo,
};

const PAUSE_DURATION_OPTIONS: readonly {
  label: string;
  days: number;
}[] = [
  { label: WELLNESS_MESSAGES.pauseDurations.oneWeek, days: 7 },
  { label: WELLNESS_MESSAGES.pauseDurations.twoWeeks, days: 14 },
  { label: WELLNESS_MESSAGES.pauseDurations.oneMonth, days: 30 },
];

const DEFAULT_PAUSE_INDEX = 0;

// --- Component ---

export function WellnessSettingsSection(): ReactNode {
  const {
    settings,
    ownerStatus,
    isLoading,
    error,
    isSaving,
    refresh,
    activate,
    updateShareLevel,
    updateDeliveryDay,
    pause,
    resume,
    disable,
  } = useWellnessSettings();

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const [isActivationOpen, setIsActivationOpen] = useState(false);
  const [isShareLevelConfirmOpen, setIsShareLevelConfirmOpen] = useState(false);
  const [pendingShareLevel, setPendingShareLevel] =
    useState<WellnessShareLevel | null>(null);
  const [isPauseConfirmOpen, setIsPauseConfirmOpen] = useState(false);
  const [selectedPauseIndex, setSelectedPauseIndex] =
    useState(DEFAULT_PAUSE_INDEX);
  const [isDisableConfirmOpen, setIsDisableConfirmOpen] = useState(false);
  const [isResumeConfirmOpen, setIsResumeConfirmOpen] = useState(false);

  // --- Handlers ---

  const handleOpenActivation = useCallback((): void => {
    setIsActivationOpen(true);
  }, []);

  const handleCloseActivation = useCallback((): void => {
    setIsActivationOpen(false);
  }, []);

  const handleActivate = useCallback(
    (shareLevel: WellnessShareLevel): void => {
      activate(shareLevel)
        .then(() => {
          setIsActivationOpen(false);
          showToast(WELLNESS_MESSAGES.activation.activateSuccess, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to activate wellness:", { error: err });
          showToast(WELLNESS_MESSAGES.activation.activateFailed, "error");
        });
    },
    [activate, showToast],
  );

  const handleShareLevelSelect = useCallback(
    (level: WellnessShareLevel): void => {
      if (settings !== null && level !== settings.shareLevel) {
        setPendingShareLevel(level);
        setIsShareLevelConfirmOpen(true);
      }
    },
    [settings],
  );

  const handleConfirmShareLevel = useCallback((): void => {
    if (pendingShareLevel === null) return;
    const level = pendingShareLevel;
    setIsShareLevelConfirmOpen(false);
    setPendingShareLevel(null);
    updateShareLevel(level)
      .then(() => {
        showToast(WELLNESS_MESSAGES.settings.saveSuccess, "success");
      })
      .catch((err: unknown) => {
        console.error("Failed to update share level:", { error: err });
        showToast(WELLNESS_MESSAGES.settings.saveFailed, "error");
      });
  }, [pendingShareLevel, updateShareLevel, showToast]);

  const handleCancelShareLevel = useCallback((): void => {
    setIsShareLevelConfirmOpen(false);
    setPendingShareLevel(null);
  }, []);

  const handleDeliveryDayChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      const day = Number(e.target.value);
      updateDeliveryDay(day)
        .then(() => {
          showToast(WELLNESS_MESSAGES.settings.saveSuccess, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to update delivery day:", { error: err });
          showToast(WELLNESS_MESSAGES.settings.saveFailed, "error");
        });
    },
    [updateDeliveryDay, showToast],
  );

  const handleOpenPause = useCallback((): void => {
    setSelectedPauseIndex(DEFAULT_PAUSE_INDEX);
    setIsPauseConfirmOpen(true);
  }, []);

  const handleConfirmPause = useCallback((): void => {
    const option = PAUSE_DURATION_OPTIONS[selectedPauseIndex];
    if (option === undefined) return;
    const until = new Date();
    until.setDate(until.getDate() + option.days);
    setIsPauseConfirmOpen(false);
    pause(until.toISOString())
      .then(() => {
        showToast(WELLNESS_MESSAGES.settings.pauseSuccess, "success");
      })
      .catch((err: unknown) => {
        console.error("Failed to pause wellness:", { error: err });
        showToast(WELLNESS_MESSAGES.settings.pauseFailed, "error");
      });
  }, [selectedPauseIndex, pause, showToast]);

  const handleCancelPause = useCallback((): void => {
    setIsPauseConfirmOpen(false);
  }, []);

  const handleOpenResume = useCallback((): void => {
    setIsResumeConfirmOpen(true);
  }, []);

  const handleConfirmResume = useCallback((): void => {
    setIsResumeConfirmOpen(false);
    resume()
      .then(() => {
        showToast(WELLNESS_MESSAGES.settings.resumeSuccess, "success");
      })
      .catch((err: unknown) => {
        console.error("Failed to resume wellness:", { error: err });
        showToast(WELLNESS_MESSAGES.settings.resumeFailed, "error");
      });
  }, [resume, showToast]);

  const handleCancelResume = useCallback((): void => {
    setIsResumeConfirmOpen(false);
  }, []);

  const handlePauseDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      setSelectedPauseIndex(Number(e.target.value));
    },
    [],
  );

  const handleOpenDisable = useCallback((): void => {
    setIsDisableConfirmOpen(true);
  }, []);

  const handleConfirmDisable = useCallback((): void => {
    setIsDisableConfirmOpen(false);
    disable()
      .then(() => {
        showToast(WELLNESS_MESSAGES.settings.saveSuccess, "success");
      })
      .catch((err: unknown) => {
        console.error("Failed to disable wellness:", { error: err });
        showToast(WELLNESS_MESSAGES.settings.saveFailed, "error");
      });
  }, [disable, showToast]);

  const handleCancelDisable = useCallback((): void => {
    setIsDisableConfirmOpen(false);
  }, []);

  // --- Helpers ---

  const isPaused = (() => {
    if (
      settings === null ||
      !settings.enabled ||
      settings.pausedUntil === null
    ) {
      return false;
    }
    // Compare against a fresh timestamp; settings changes infrequently
    // so the pause check does not need sub-second accuracy.
    const now = new Date();
    return Date.parse(settings.pausedUntil) > now.getTime();
  })();

  const formatPausedUntilDate = (iso: string): string => {
    const date = new Date(iso);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  };

  // --- Render ---

  const renderContent = (): ReactNode => {
    if (isLoading) {
      return (
        <p
          className="text-lg text-text-secondary"
          role="status"
          aria-live="polite"
        >
          {WELLNESS_MESSAGES.settings.loadingText}
        </p>
      );
    }

    if (error) {
      return (
        <div className="rounded-card border border-error-light bg-error-light p-4 space-y-3">
          <p className="text-lg text-error" role="alert">
            ● {WELLNESS_MESSAGES.settings.loadFailed}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full border border-error text-lg text-error px-6 hover:bg-error-light transition-colors"
            onClick={refresh}
          >
            {WELLNESS_MESSAGES.settings.retryButton}
          </button>
        </div>
      );
    }

    // Not activated
    if (settings === null) {
      return (
        <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
          <p className="text-lg text-text-secondary">
            {WELLNESS_MESSAGES.settings.notStarted}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full bg-accent-primary text-text-on-accent px-6 text-lg transition-colors"
            onClick={handleOpenActivation}
          >
            {WELLNESS_MESSAGES.settings.startButton}
          </button>
        </div>
      );
    }

    // Disabled
    if (!settings.enabled) {
      return (
        <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
          <p className="text-lg text-text-primary">
            {WELLNESS_MESSAGES.settings.disabledMessage}
          </p>
          <p className="text-base text-text-secondary leading-relaxed">
            {WELLNESS_MESSAGES.activation.nonSurveillance}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full bg-accent-primary text-text-on-accent px-6 text-lg transition-colors"
            onClick={handleOpenActivation}
          >
            {WELLNESS_MESSAGES.settings.reEnableButton}
          </button>
        </div>
      );
    }

    // Paused
    if (isPaused && settings.pausedUntil !== null) {
      return (
        <div className="space-y-4">
          <div className="rounded-card border border-warning-light bg-warning-light p-4 space-y-2">
            <p className="text-lg font-medium text-warning">
              △ {WELLNESS_MESSAGES.settings.pausedUntilLabel}
            </p>
            <p className="text-lg text-text-primary">
              {formatPausedUntilDate(settings.pausedUntil)} まで
            </p>
            <p className="text-base text-text-secondary leading-relaxed">
              {WELLNESS_MESSAGES.settings.pausedDescription}
            </p>
          </div>
          {/* Show current share level even while paused */}
          <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-1">
            <p className="text-base text-text-secondary">
              {WELLNESS_MESSAGES.settings.currentShareInfo}
            </p>
            <div className="flex items-center gap-2">
              <WellnessShareLevelBadge level={settings.shareLevel} />
              <span className="text-lg text-text-primary">
                {SHARE_LEVEL_INFO[settings.shareLevel]}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent px-6 text-lg transition-colors"
            onClick={handleOpenResume}
            disabled={isSaving}
          >
            {WELLNESS_MESSAGES.settings.resumeButton}
          </button>
        </div>
      );
    }

    // Enabled — full settings form
    return (
      <div className="space-y-5">
        {/* Share level radio group */}
        <div className="space-y-2">
          <p className="text-lg font-medium text-text-primary">
            {WELLNESS_MESSAGES.settings.shareLevelLabel}
          </p>
          <div
            role="radiogroup"
            aria-label={WELLNESS_MESSAGES.settings.shareLevelLabel}
            className="flex flex-col gap-2 md:flex-row"
          >
            {SHARE_LEVELS.map((option) => {
              const isSelected = settings.shareLevel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isSaving}
                  className={`flex-1 min-h-11 rounded-full px-4 text-lg transition-colors ${
                    isSelected
                      ? "bg-accent-primary text-text-on-accent shadow-sm"
                      : "bg-bg-surface border border-border text-text-secondary"
                  }`}
                  onClick={(): void => handleShareLevelSelect(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Delivery day select */}
        <div className="space-y-2">
          <label
            htmlFor="wellness-delivery-day"
            className="text-lg font-medium text-text-primary"
          >
            {WELLNESS_MESSAGES.settings.deliveryDayLabel}
          </label>
          <select
            id="wellness-delivery-day"
            value={settings.weeklySummaryDay}
            onChange={handleDeliveryDayChange}
            disabled={isSaving}
            className="w-full min-h-11 rounded-card border border-border-light bg-bg-surface px-4 py-2 text-lg"
          >
            {WELLNESS_MESSAGES.weekdays.map((dayLabel, index) => (
              <option key={index} value={index}>
                {dayLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="wellness-pause-duration"
            className="text-lg font-medium text-text-primary"
          >
            {WELLNESS_MESSAGES.settings.pauseDurationLabel}
          </label>
          <select
            id="wellness-pause-duration"
            value={selectedPauseIndex}
            onChange={handlePauseDurationChange}
            disabled={isSaving}
            className="w-full min-h-11 rounded-card border border-border-light bg-bg-surface px-4 py-2 text-lg"
          >
            {PAUSE_DURATION_OPTIONS.map((option, index) => (
              <option key={option.days} value={index}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Owner status card */}
        {ownerStatus !== null && (
          <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-2">
            <h3 className="text-lg font-semibold text-text-primary">
              {WELLNESS_MESSAGES.ownerStatus.title}
            </h3>
            <p className="text-lg text-text-primary">
              {WELLNESS_MESSAGES.ownerStatus.engagedDaysLabel}:{" "}
              <span className="font-semibold">
                {ownerStatus.engagedDaysLast7}
              </span>
              {WELLNESS_MESSAGES.ownerStatus.daysUnit}
            </p>
            {ownerStatus.missedStreak > 0 && (
              <p className="text-lg text-warning">
                △ {WELLNESS_MESSAGES.ownerStatus.missedStreakLabel}:{" "}
                <span className="font-semibold">
                  {ownerStatus.missedStreak}
                </span>
                {WELLNESS_MESSAGES.ownerStatus.daysUnit}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="text-base text-text-secondary">
                {WELLNESS_MESSAGES.ownerStatus.shareLevelLabel}:
              </span>
              <WellnessShareLevelBadge level={settings.shareLevel} />
            </div>
          </div>
        )}

        {/* Current share info */}
        <div className="rounded-card border border-border-light bg-bg-surface p-4">
          <p className="text-base font-medium text-text-secondary">
            {WELLNESS_MESSAGES.settings.currentShareInfo}
          </p>
          <p className="text-lg text-text-primary mt-1">
            {SHARE_LEVEL_INFO[settings.shareLevel]}
          </p>
        </div>

        {/* Pause button */}
        <button
          type="button"
          className="w-full min-h-11 rounded-full border border-border-light text-text-secondary text-lg transition-colors hover:bg-bg-surface-hover active:bg-bg-surface-hover"
          onClick={handleOpenPause}
          disabled={isSaving}
        >
          {WELLNESS_MESSAGES.settings.pauseButton}
        </button>

        {/* Disable button */}
        <button
          type="button"
          className="w-full min-h-11 rounded-full border border-error-light text-lg text-error transition-colors hover:bg-error-light active:bg-error-light"
          onClick={handleOpenDisable}
          disabled={isSaving}
        >
          {WELLNESS_MESSAGES.settings.disableButton}
        </button>
      </div>
    );
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-secondary">
        {WELLNESS_MESSAGES.settings.sectionTitle}
      </h2>
      <p className="text-lg text-text-secondary">
        {WELLNESS_MESSAGES.settings.sectionDescription}
      </p>

      {renderContent()}

      {/* Activation dialog */}
      <WellnessActivationDialog
        isOpen={isActivationOpen}
        isSaving={isSaving}
        onActivate={handleActivate}
        onCancel={handleCloseActivation}
      />

      {/* Share level change confirm */}
      <ConfirmDialog
        isOpen={isShareLevelConfirmOpen}
        title={WELLNESS_MESSAGES.settings.shareLevelLabel}
        message={WELLNESS_MESSAGES.settings.confirmShareLevelChange}
        onConfirm={handleConfirmShareLevel}
        onCancel={handleCancelShareLevel}
      />

      {/* Pause confirm with duration picker */}
      <ConfirmDialog
        isOpen={isPauseConfirmOpen}
        title={WELLNESS_MESSAGES.settings.pauseButton}
        message={`${PAUSE_DURATION_OPTIONS[selectedPauseIndex]?.label ?? ""}、${WELLNESS_MESSAGES.settings.pauseConfirmTemplate}`}
        confirmLabel={WELLNESS_MESSAGES.settings.pauseButton}
        onConfirm={handleConfirmPause}
        onCancel={handleCancelPause}
      />

      {/* Resume confirm */}
      <ConfirmDialog
        isOpen={isResumeConfirmOpen}
        title={WELLNESS_MESSAGES.settings.resumeButton}
        message={WELLNESS_MESSAGES.settings.resumeConfirmMessage}
        onConfirm={handleConfirmResume}
        onCancel={handleCancelResume}
      />

      {/* Disable confirm */}
      <ConfirmDialog
        isOpen={isDisableConfirmOpen}
        title={WELLNESS_MESSAGES.settings.disableConfirmTitle}
        message={WELLNESS_MESSAGES.settings.disableConfirmMessage}
        variant="danger"
        onConfirm={handleConfirmDisable}
        onCancel={handleCancelDisable}
      />

      {/* Toast */}
      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </section>
  );
}
