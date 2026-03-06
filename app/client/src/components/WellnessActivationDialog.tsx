import { useRef, useEffect, useCallback, useState } from "react";

import { WELLNESS_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { WellnessShareLevel } from "../lib/wellness-api";

// --- Constants ---

const SHARE_LEVEL_OPTIONS: readonly {
  value: WellnessShareLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "basic",
    label: WELLNESS_MESSAGES.shareLevel.basic,
    description: WELLNESS_MESSAGES.shareLevel.basicDescription,
  },
  {
    value: "summary",
    label: WELLNESS_MESSAGES.shareLevel.summary,
    description: WELLNESS_MESSAGES.shareLevel.summaryDescription,
  },
  {
    value: "detailed",
    label: WELLNESS_MESSAGES.shareLevel.detailed,
    description: WELLNESS_MESSAGES.shareLevel.detailedDescription,
  },
];

// --- Props ---

interface WellnessActivationDialogProps {
  isOpen: boolean;
  isSaving: boolean;
  onActivate: (shareLevel: WellnessShareLevel) => void;
  onCancel: () => void;
}

// --- Component ---

export function WellnessActivationDialog({
  isOpen,
  isSaving,
  onActivate,
  onCancel,
}: WellnessActivationDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedLevel, setSelectedLevel] =
    useState<WellnessShareLevel>("basic");
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
      setSelectedLevel("basic");
      setHasConsented(false);
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  const handleActivate = useCallback((): void => {
    if (!hasConsented || isSaving) return;
    onActivate(selectedLevel);
  }, [hasConsented, isSaving, onActivate, selectedLevel]);

  const handleConsentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setHasConsented(e.target.checked);
    },
    [],
  );

  const handleSelectBasic = useCallback((): void => {
    setSelectedLevel("basic");
  }, []);

  const handleSelectSummary = useCallback((): void => {
    setSelectedLevel("summary");
  }, []);

  const handleSelectDetailed = useCallback((): void => {
    setSelectedLevel("detailed");
  }, []);

  const shareLevelHandlers: Record<WellnessShareLevel, () => void> = {
    basic: handleSelectBasic,
    summary: handleSelectSummary,
    detailed: handleSelectDetailed,
  };

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-md w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-5">
        {/* Title */}
        <h2 className="text-xl font-semibold text-text-primary">
          {WELLNESS_MESSAGES.activation.title}
        </h2>

        {/* Description */}
        <div className="space-y-2">
          <p className="text-lg text-text-primary leading-relaxed">
            {WELLNESS_MESSAGES.activation.description}
          </p>
          <p className="text-base text-text-secondary leading-relaxed">
            {WELLNESS_MESSAGES.activation.nonSurveillance}
          </p>
        </div>

        {/* Share level selection */}
        <div className="space-y-2">
          <p className="text-lg font-medium text-text-primary">
            {WELLNESS_MESSAGES.settings.shareLevelLabel}
          </p>
          <div
            role="radiogroup"
            aria-label={WELLNESS_MESSAGES.settings.shareLevelLabel}
            className="space-y-2"
          >
            {SHARE_LEVEL_OPTIONS.map((option) => {
              const isSelected = selectedLevel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`w-full text-left rounded-card px-4 py-3 border transition-colors ${
                    isSelected
                      ? "border-accent-primary bg-accent-primary-light"
                      : "border-border-light bg-bg-surface hover:bg-bg-surface-hover"
                  }`}
                  onClick={shareLevelHandlers[option.value]}
                >
                  <span className="text-lg font-medium text-text-primary">
                    {option.label}
                  </span>
                  <span className="block text-base text-text-secondary mt-0.5">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Consent checkbox */}
        <label className="flex items-start gap-3 cursor-pointer min-h-11">
          <input
            type="checkbox"
            checked={hasConsented}
            onChange={handleConsentChange}
            className="mt-1 w-5 h-5 accent-accent-primary flex-none"
          />
          <span className="text-lg text-text-primary leading-relaxed">
            {WELLNESS_MESSAGES.activation.consentLabel}
          </span>
        </label>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary hover:bg-bg-surface-hover active:bg-border-light transition-colors"
            onClick={onCancel}
            disabled={isSaving}
          >
            {WELLNESS_MESSAGES.activation.laterButton}
          </button>
          <button
            type="button"
            className={`flex-1 min-h-11 rounded-full text-lg transition-colors ${
              hasConsented && !isSaving
                ? "bg-accent-primary text-text-on-accent"
                : "bg-bg-surface text-text-secondary border border-border cursor-default"
            }`}
            onClick={handleActivate}
            disabled={!hasConsented || isSaving}
          >
            {isSaving
              ? WELLNESS_MESSAGES.activation.saving
              : WELLNESS_MESSAGES.activation.startButton}
          </button>
        </div>
      </div>
    </dialog>
  );
}
