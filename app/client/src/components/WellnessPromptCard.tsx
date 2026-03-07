import { useState, useCallback } from "react";

import {
  WELLNESS_PROMPT_MESSAGES,
  WELLNESS_PROMPT_DISMISSED_STORAGE_KEY,
  WELLNESS_PROMPT_DISMISS_DAYS,
} from "../lib/constants";
import { useWellnessSettings } from "../hooks/useWellnessSettings";
import { useToast } from "../hooks/useToast";
import { WellnessActivationDialog } from "./WellnessActivationDialog";
import { Toast } from "./Toast";
import { WELLNESS_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { WellnessShareLevel } from "../lib/wellness-api";

// --- Constants ---

const MS_PER_DAY = 86_400_000;

// --- Helpers ---

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(WELLNESS_PROMPT_DISMISSED_STORAGE_KEY);
    if (raw === null) return false;
    const dismissedAt = Number(raw);
    if (Number.isNaN(dismissedAt)) return false;
    const elapsed = Date.now() - dismissedAt;
    return elapsed < WELLNESS_PROMPT_DISMISS_DAYS * MS_PER_DAY;
  } catch {
    return false;
  }
}

function saveDismissed(): void {
  try {
    localStorage.setItem(
      WELLNESS_PROMPT_DISMISSED_STORAGE_KEY,
      String(Date.now()),
    );
  } catch {
    // localStorage unavailable — card will reappear next time
  }
}

// --- Props ---

interface WellnessPromptCardProps {
  hasFamilyMembers: boolean;
  onOpenInviteDialog: () => void;
}

// --- Component ---

export function WellnessPromptCard({
  hasFamilyMembers,
  onOpenInviteDialog,
}: WellnessPromptCardProps): ReactNode {
  const { settings, isLoading, activate } = useWellnessSettings();
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const [dismissed, setDismissed] = useState(isDismissed);
  const [isActivationOpen, setIsActivationOpen] = useState(false);

  const handleDismiss = useCallback((): void => {
    saveDismissed();
    setDismissed(true);
  }, []);

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
          console.error("Failed to activate wellness from prompt card:", {
            error: err,
          });
          showToast(WELLNESS_MESSAGES.activation.activateFailed, "error");
        });
    },
    [activate, showToast],
  );

  // Don't render while loading, if already active, or if dismissed
  if (isLoading) return null;
  if (settings !== null && settings.enabled) return null;
  if (dismissed) return null;

  return (
    <>
      <div className="rounded-card border border-accent-primary/30 bg-accent-primary-light p-4 space-y-3">
        <h3 className="text-lg font-semibold text-text-primary">
          {WELLNESS_PROMPT_MESSAGES.title}
        </h3>

        {hasFamilyMembers ? (
          <>
            <p className="text-lg text-text-primary leading-relaxed">
              {WELLNESS_PROMPT_MESSAGES.descriptionWithFamily}
            </p>
            <p className="text-base text-text-secondary leading-relaxed">
              {WELLNESS_PROMPT_MESSAGES.nonSurveillance}
            </p>
            <button
              type="button"
              className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors"
              onClick={handleOpenActivation}
            >
              {WELLNESS_PROMPT_MESSAGES.startButton}
            </button>
          </>
        ) : (
          <>
            <p className="text-lg text-text-primary leading-relaxed">
              {WELLNESS_PROMPT_MESSAGES.descriptionNoFamily}
            </p>
            <button
              type="button"
              className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors"
              onClick={onOpenInviteDialog}
            >
              {WELLNESS_PROMPT_MESSAGES.inviteFamilyButton}
            </button>
          </>
        )}

        <p className="text-base text-text-secondary leading-relaxed">
          {WELLNESS_PROMPT_MESSAGES.settingsHint}
        </p>

        <button
          type="button"
          className="w-full min-h-11 text-lg text-text-secondary transition-colors"
          onClick={handleDismiss}
        >
          {WELLNESS_PROMPT_MESSAGES.laterButton}
        </button>
      </div>

      <WellnessActivationDialog
        isOpen={isActivationOpen}
        isSaving={false}
        hasFamilyMembers={hasFamilyMembers}
        onActivate={handleActivate}
        onCancel={handleCloseActivation}
        onNavigateToFamily={onOpenInviteDialog}
      />

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </>
  );
}
