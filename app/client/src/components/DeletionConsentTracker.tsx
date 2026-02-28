import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  getDeletionConsentStatus,
  initiateDataDeletion,
  cancelDataDeletion,
} from "../lib/family-api";
import { ConfirmDialog } from "./ConfirmDialog";

import type { ReactNode } from "react";
import type { DeletionConsentStatus } from "../lib/family-api";

interface DeletionConsentTrackerProps {
  creatorId: string;
  creatorName: string;
}

function DeletionConsentIcon({
  consented,
}: {
  consented: boolean | null;
}): ReactNode {
  if (consented === true) {
    return (
      <svg
        className="w-6 h-6 text-success flex-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (consented === false) {
    return (
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
    );
  }
  return (
    <svg
      className="w-6 h-6 text-text-secondary flex-none"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M9 12h6" />
    </svg>
  );
}

export function DeletionConsentTracker({
  creatorId,
  creatorName,
}: DeletionConsentTrackerProps): ReactNode {
  const [status, setStatus] = useState<DeletionConsentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInitiateConfirm, setShowInitiateConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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

  const handleInitiate = useCallback((): void => {
    setShowInitiateConfirm(true);
  }, []);

  const handleInitiateConfirm = useCallback((): void => {
    setShowInitiateConfirm(false);
    setIsSubmitting(true);
    void initiateDataDeletion(creatorId)
      .then(() => getDeletionConsentStatus(creatorId))
      .then((data) => {
        setStatus(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to initiate data deletion:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [creatorId]);

  const handleInitiateCancel = useCallback((): void => {
    setShowInitiateConfirm(false);
  }, []);

  const handleCancel = useCallback((): void => {
    setShowCancelConfirm(true);
  }, []);

  const handleCancelConfirm = useCallback((): void => {
    setShowCancelConfirm(false);
    setIsSubmitting(true);
    void cancelDataDeletion(creatorId)
      .then(() => getDeletionConsentStatus(creatorId))
      .then((data) => {
        setStatus(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to cancel data deletion:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [creatorId]);

  const handleCancelCancel = useCallback((): void => {
    setShowCancelConfirm(false);
  }, []);

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

  // Narrow status to non-null for the in-progress branch
  const inProgressStatus =
    status !== null && status.deletionStatus === "deletion_consent_gathering"
      ? status
      : null;

  return (
    <div className="space-y-4">
      <details className="group">
        <summary className="text-lg font-semibold text-text-secondary cursor-pointer list-none flex items-center gap-2 min-h-11">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-error flex-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          記録をすべて消す
          <svg
            className="h-4 w-4 text-text-secondary flex-none ml-auto transition-transform details-chevron"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </summary>

        <div className="pt-3 space-y-4">
          {inProgressStatus !== null ? (
            <>
              <p className="text-lg text-text-secondary">
                {creatorName}
                さんの記録を消すことについて、家族全員の同意を待っています。
              </p>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-base text-text-secondary">同意の進捗</p>
                  <p className="text-base text-text-secondary">
                    {String(inProgressStatus.consentedCount)}/
                    {String(inProgressStatus.totalCount)}人が同意
                  </p>
                </div>
                <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-primary rounded-full transition-all"
                    style={{
                      width: `${String(
                        inProgressStatus.totalCount > 0
                          ? Math.round(
                              (inProgressStatus.consentedCount /
                                inProgressStatus.totalCount) *
                                100,
                            )
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Individual consent records */}
              {inProgressStatus.records.length > 0 && (
                <div className="space-y-2">
                  {inProgressStatus.records.map((record) => (
                    <div
                      key={record.memberName}
                      className="flex items-center gap-3 px-3 py-2 rounded-card bg-bg-primary"
                    >
                      <DeletionConsentIcon consented={record.consented} />
                      <p className="text-lg text-text-primary">
                        {record.memberName}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="w-full min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                disabled={isSubmitting}
                onClick={handleCancel}
              >
                取り消す
              </button>
            </>
          ) : (
            <>
              <p className="text-lg text-text-secondary leading-relaxed">
                {creatorName}
                さんのすべての記録（会話、ノート、音声）を消すことができます。
                消すにはご家族全員の同意が必要です。
              </p>
              <button
                type="button"
                className="w-full min-h-11 rounded-full bg-error text-text-on-accent text-lg transition-colors disabled:opacity-50"
                disabled={isSubmitting}
                onClick={handleInitiate}
              >
                記録を消す手続きを始める
              </button>
            </>
          )}
        </div>
      </details>

      <ConfirmDialog
        isOpen={showInitiateConfirm}
        title="記録の削除について確認"
        message={`${creatorName}さんの記録を消すことについて、ご家族全員にお知らせを送ります。全員が同意した場合、すべての記録が消えます。\n\nよろしいですか？`}
        confirmLabel="確認を始める"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleInitiateConfirm}
        onCancel={handleInitiateCancel}
      />
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="手続きの取り消し"
        message="記録を消す手続きを取り消します。記録はそのまま残ります。"
        confirmLabel="取り消す"
        cancelLabel="続ける"
        onConfirm={handleCancelConfirm}
        onCancel={handleCancelCancel}
      />
    </div>
  );
}
