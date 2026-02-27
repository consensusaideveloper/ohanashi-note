import { useState, useRef, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { reportDeath } from "../lib/family-api";

import type { ReactNode } from "react";

interface DeathReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  creatorId: string;
  creatorName: string;
  onReported: () => void;
}

type ConfirmStep = "first" | "second";

export function DeathReportDialog({
  isOpen,
  onClose,
  creatorId,
  creatorName,
  onReported,
}: DeathReportDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [step, setStep] = useState<ConfirmStep>("first");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep("first");
      setIsSubmitting(false);
      setError("");
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  const handleClose = useCallback((): void => {
    onClose();
  }, [onClose]);

  const handleNextStep = useCallback((): void => {
    setStep("second");
  }, []);

  const handleConfirmReport = useCallback((): void => {
    setIsSubmitting(true);
    setError("");
    void reportDeath(creatorId)
      .then(() => {
        onReported();
        onClose();
      })
      .catch((err: unknown) => {
        console.error("Failed to report death:", {
          error: err,
          creatorId,
        });
        setError(UI_MESSAGES.familyError.reportDeathFailed);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [creatorId, onReported, onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-sm w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">
          {UI_MESSAGES.family.deathReportDialogTitle}
        </h2>

        <p className="text-lg text-text-secondary">{creatorName}さん</p>

        {step === "first" && (
          <>
            <p className="text-lg text-text-secondary leading-relaxed whitespace-pre-line">
              {UI_MESSAGES.family.deathReportConfirmMessage}
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
                onClick={handleClose}
              >
                やめる
              </button>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors"
                onClick={handleNextStep}
              >
                次へ
              </button>
            </div>
          </>
        )}

        {step === "second" && (
          <>
            <p className="text-lg text-text-secondary leading-relaxed">
              {UI_MESSAGES.family.deathReportSecondConfirmMessage}
            </p>

            {error !== "" && <p className="text-lg text-error">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
                onClick={handleClose}
              >
                やめる
              </button>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full bg-error text-text-on-accent text-lg transition-colors disabled:opacity-50"
                disabled={isSubmitting}
                onClick={handleConfirmReport}
              >
                {isSubmitting ? "送信中..." : "報告する"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
