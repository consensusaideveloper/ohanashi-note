import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { ApiError } from "../lib/api";
import { getConsentStatus, submitConsent } from "../lib/family-api";

import type { ReactNode } from "react";
import type { ConsentStatus } from "../lib/family-api";

interface ConsentScreenProps {
  creatorId: string;
  creatorName: string;
  onLifecycleChanged?: () => void;
}

export function ConsentScreen({
  creatorId,
  creatorName,
  onLifecycleChanged,
}: ConsentScreenProps): ReactNode {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadConsentStatus = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getConsentStatus(creatorId)
      .then((data) => {
        setConsentStatus(data);
        if (data.status !== "consent_gathering") {
          onLifecycleChanged?.();
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load consent status:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId, onLifecycleChanged]);

  useEffect(() => {
    loadConsentStatus();
  }, [loadConsentStatus]);

  const handleConsent = useCallback(
    (consented: boolean): void => {
      setIsSubmitting(true);
      void submitConsent(creatorId, consented)
        .then(() => getConsentStatus(creatorId))
        .then((data) => {
          setConsentStatus(data);
          if (data.status !== "consent_gathering") {
            onLifecycleChanged?.();
          }
        })
        .catch((err: unknown) => {
          console.error("Failed to submit consent:", {
            error: err,
            creatorId,
            consented,
          });
          if (err instanceof ApiError && err.status === 409) {
            onLifecycleChanged?.();
          } else {
            setError(true);
          }
        })
        .finally(() => {
          setIsSubmitting(false);
        });
    },
    [creatorId, onLifecycleChanged],
  );

  const handleAgree = useCallback((): void => {
    handleConsent(true);
  }, [handleConsent]);

  const handleDecline = useCallback((): void => {
    handleConsent(false);
  }, [handleConsent]);

  const handleRetry = useCallback((): void => {
    loadConsentStatus();
  }, [loadConsentStatus]);

  if (isLoading) {
    return (
      <div className="rounded-card border border-border-light bg-bg-surface p-6">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-error-light bg-error-light p-6 space-y-3">
        <p className="text-lg text-error">
          {UI_MESSAGES.familyError.consentStatusFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full border border-error text-error bg-bg-surface px-6 text-lg transition-colors active:bg-error-light"
          onClick={handleRetry}
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  const myRecord = consentStatus?.consentRecords?.[0] ?? null;
  const hasResponded = myRecord !== null && myRecord.consented !== null;

  return (
    <div className="rounded-card border border-border-light bg-bg-surface p-6 space-y-4">
      <h2 className="text-xl font-semibold text-text-primary">
        {UI_MESSAGES.family.consentDialogTitle}
      </h2>

      <p className="text-lg text-text-secondary">
        {creatorName}さんの{UI_MESSAGES.family.consentExplanation}
      </p>

      {!hasResponded && (
        <p className="text-base text-text-secondary whitespace-pre-line">
          {UI_MESSAGES.family.consentDetailExplanation}
        </p>
      )}

      {hasResponded ? (
        <div className="rounded-card border border-border-light bg-bg-primary p-4 flex items-center gap-3">
          {myRecord.consented === true ? (
            <>
              <svg
                className="w-6 h-6 text-success flex-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <p className="text-lg text-text-primary">
                {UI_MESSAGES.family.consentGiven}
              </p>
            </>
          ) : (
            <>
              <svg
                className="w-6 h-6 text-error flex-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <p className="text-lg text-text-primary">
                {UI_MESSAGES.family.consentDeclined}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover disabled:opacity-50"
            disabled={isSubmitting}
            onClick={handleDecline}
          >
            {UI_MESSAGES.family.consentDeclineButton}
          </button>
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors disabled:opacity-50"
            disabled={isSubmitting}
            onClick={handleAgree}
          >
            {isSubmitting ? "送信中..." : UI_MESSAGES.family.consentAgreeButton}
          </button>
        </div>
      )}
    </div>
  );
}
