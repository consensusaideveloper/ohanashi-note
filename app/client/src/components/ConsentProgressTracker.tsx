import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { getConsentStatus } from "../lib/family-api";

import type { ReactNode } from "react";
import type { ConsentStatus, ConsentRecord } from "../lib/family-api";

interface ConsentProgressTrackerProps {
  creatorId: string;
}

interface ConsentIconProps {
  consented: boolean | null;
  autoResolved?: boolean;
}

function ConsentIcon({ consented, autoResolved }: ConsentIconProps): ReactNode {
  if (consented === true && autoResolved) {
    return (
      <svg
        className="w-6 h-6 text-text-secondary flex-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
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

interface ConsentLabelProps {
  consented: boolean | null;
  autoResolved?: boolean;
}

function ConsentLabel({
  consented,
  autoResolved,
}: ConsentLabelProps): ReactNode {
  if (consented === true && autoResolved) {
    return (
      <span className="text-base text-text-secondary">
        {UI_MESSAGES.family.consentAutoResolved}
      </span>
    );
  }
  if (consented === true) {
    return (
      <span className="text-base text-success">
        {UI_MESSAGES.family.consentGiven}
      </span>
    );
  }
  if (consented === false) {
    return (
      <span className="text-base text-error">
        {UI_MESSAGES.family.consentDeclined}
      </span>
    );
  }
  return (
    <span className="text-base text-text-secondary">
      {UI_MESSAGES.family.consentPending}
    </span>
  );
}

export function ConsentProgressTracker({
  creatorId,
}: ConsentProgressTrackerProps): ReactNode {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadConsentStatus = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getConsentStatus(creatorId)
      .then((data) => {
        setConsentStatus(data);
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
  }, [creatorId]);

  useEffect(() => {
    loadConsentStatus();
  }, [loadConsentStatus]);

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

  if (consentStatus === null) {
    return null;
  }

  const { consentRecords, totalCount, consentedCount } = consentStatus;
  const allConsented = totalCount > 0 && consentedCount === totalCount;

  return (
    <div className="rounded-card border border-border-light bg-bg-surface p-6 space-y-4">
      <h2 className="text-xl font-semibold text-text-primary">
        {UI_MESSAGES.family.consentDialogTitle}
      </h2>

      <p className="text-lg text-text-secondary">
        {consentedCount}/{totalCount}人が同意
      </p>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-bg-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full bg-success transition-all"
          style={{
            width:
              totalCount > 0 ? `${(consentedCount / totalCount) * 100}%` : "0%",
          }}
        />
      </div>

      {/* Member list */}
      {consentRecords.length > 0 && (
        <ul className="space-y-3">
          {consentRecords.map((record: ConsentRecord) => (
            <li
              key={record.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-border-light last:border-b-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ConsentIcon
                  consented={record.consented}
                  autoResolved={record.autoResolved}
                />
                <p className="text-lg text-text-primary">{record.memberName}</p>
              </div>
              <ConsentLabel
                consented={record.consented}
                autoResolved={record.autoResolved}
              />
            </li>
          ))}
        </ul>
      )}

      {allConsented && (
        <div className="rounded-card bg-success-light p-4 flex items-center gap-3">
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
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg text-success font-medium">
            {UI_MESSAGES.family.noteOpened}
          </p>
        </div>
      )}
    </div>
  );
}
