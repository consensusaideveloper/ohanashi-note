import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  getDeletionConsentStatus,
  submitDeletionConsent,
} from "../lib/family-api";

import type { ReactNode } from "react";
import type { DeletionConsentStatus } from "../lib/family-api";

interface DeletionConsentScreenProps {
  creatorId: string;
  creatorName: string;
}

export function DeletionConsentScreen({
  creatorId,
  creatorName,
}: DeletionConsentScreenProps): ReactNode {
  const [status, setStatus] = useState<DeletionConsentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadStatus = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getDeletionConsentStatus(creatorId)
      .then((data) => {
        setStatus(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load deletion consent status:", {
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
    loadStatus();
  }, [loadStatus]);

  const handleConsent = useCallback(
    (consented: boolean): void => {
      setIsSubmitting(true);
      void submitDeletionConsent(creatorId, consented)
        .then(() => getDeletionConsentStatus(creatorId))
        .then((data) => {
          setStatus(data);
        })
        .catch((err: unknown) => {
          console.error("Failed to submit deletion consent:", {
            error: err,
            creatorId,
            consented,
          });
          setError(true);
        })
        .finally(() => {
          setIsSubmitting(false);
        });
    },
    [creatorId],
  );

  const handleAgree = useCallback((): void => {
    handleConsent(true);
  }, [handleConsent]);

  const handleDecline = useCallback((): void => {
    handleConsent(false);
  }, [handleConsent]);

  const handleRetry = useCallback((): void => {
    loadStatus();
  }, [loadStatus]);

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
        <p className="text-lg text-error">{UI_MESSAGES.error.loadFailed}</p>
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

  // Not in deletion consent gathering state
  if (status === null || status.deletionStatus === null) {
    return null;
  }

  const myConsent = status.myConsent;
  const hasResponded = myConsent !== null && myConsent.consented !== null;

  return (
    <div className="rounded-card border border-error bg-bg-surface p-6 space-y-4">
      <h2 className="text-xl font-semibold text-error">データ削除への同意</h2>

      <p className="text-lg text-text-secondary">
        {creatorName}
        さんのノートデータの削除について、ご家族全員の同意が必要です。
      </p>

      <p className="text-base text-text-secondary">
        同意すると、すべての会話記録・ノートの内容が完全に削除されます。この操作は取り消すことができません。
        同意しない場合は、データは引き続き保護されます。
      </p>

      {hasResponded ? (
        <div className="rounded-card border border-border-light bg-bg-primary p-4 flex items-center gap-3">
          {myConsent.consented === true ? (
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
              <p className="text-lg text-text-primary">削除に同意しました</p>
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
                削除を拒否しました。データは保護されます。
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
            削除しない
          </button>
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full bg-error text-text-on-accent text-lg transition-colors disabled:opacity-50"
            disabled={isSubmitting}
            onClick={handleAgree}
          >
            {isSubmitting ? "送信中..." : "削除に同意する"}
          </button>
        </div>
      )}
    </div>
  );
}
