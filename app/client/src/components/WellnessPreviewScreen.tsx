import { useState, useEffect, useCallback } from "react";

import { getWellnessPreview } from "../lib/wellness-api";
import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type {
  WellnessDashboard,
  ActivityTrendEntry,
} from "../lib/wellness-api";

interface WellnessPreviewScreenProps {
  onBack: () => void;
}

const SCREEN_TITLE = "家族への見守り情報";
const LAST_CONVERSATION_LABEL = UI_MESSAGES.wellness.lastConversation;
const STREAK_LABEL = UI_MESSAGES.wellness.currentStreak;
const ACTIVITY_TREND_TITLE = UI_MESSAGES.wellness.activityTrendTitle;
const HAD_CONVERSATION_LABEL = UI_MESSAGES.wellness.hadConversation;
const NO_CONVERSATION_LABEL = UI_MESSAGES.wellness.noConversation;
const NO_DATA_MESSAGE = UI_MESSAGES.wellness.noData;
const PREVIEW_NOTE = "これがご家族に表示される情報です";
const LOADING_TEXT = "読み込み中...";
const ERROR_TEXT = UI_MESSAGES.wellness.loadFailed;
const RETRY_LABEL = "もう一度読み込む";
const CONSECUTIVE_DAYS_SUFFIX = "日連続";
const DISABLED_MESSAGE = "見守りは利用されていません";

function formatDate(dateString: string): string {
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return dateString;
  }
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return dateString;
  }
  return `${String(month)}月${String(day)}日`;
}

function ActivityTrendItem({
  entry,
}: {
  entry: ActivityTrendEntry;
}): ReactNode {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-lg text-text-secondary min-w-[4rem]">
        {formatDate(entry.date)}
      </span>
      {entry.hadConversation ? (
        <span className="flex items-center gap-1.5 text-lg text-success font-medium">
          {/* Check mark icon */}
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
          {HAD_CONVERSATION_LABEL}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-lg text-text-secondary">
          {/* X mark icon */}
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
          {NO_CONVERSATION_LABEL}
        </span>
      )}
    </div>
  );
}

export function WellnessPreviewScreen({
  onBack,
}: WellnessPreviewScreenProps): ReactNode {
  const [preview, setPreview] = useState<WellnessDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWellnessPreview()
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load wellness preview:", { error: err });
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleRetry = useCallback((): void => {
    setLoading(true);
    setError(false);
    setReloadKey((key) => key + 1);
  }, []);

  const handleBack = useCallback((): void => {
    onBack();
  }, [onBack]);

  return (
    <div className="min-h-dvh flex flex-col bg-bg-primary">
      {/* Header with back button */}
      <div className="flex items-center px-4 py-4">
        <button
          type="button"
          className="min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-bg-surface-hover active:bg-border-light transition-colors"
          onClick={handleBack}
          aria-label="戻る"
        >
          <svg
            className="w-6 h-6 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary ml-2">
          {SCREEN_TITLE}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Loading state */}
          {loading && (
            <div className="bg-bg-surface rounded-card border border-border-light p-4">
              <p className="text-lg text-text-secondary">{LOADING_TEXT}</p>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
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
          )}

          {/* Data loaded successfully */}
          {!loading && !error && preview !== null && (
            <>
              {!preview.enabled && (
                <div className="bg-bg-surface rounded-card border border-border-light p-4">
                  <p className="text-lg text-text-secondary">
                    {DISABLED_MESSAGE}
                  </p>
                </div>
              )}

              {/* Last conversation date */}
              {preview.enabled && (
                <div className="bg-bg-surface rounded-card border border-border-light p-4 space-y-1">
                  <p className="text-lg text-text-secondary">
                    {LAST_CONVERSATION_LABEL}
                  </p>
                  <p className="text-xl font-medium text-text-primary">
                    {preview.lastConversationDate !== null
                      ? formatDate(preview.lastConversationDate)
                      : NO_DATA_MESSAGE}
                  </p>
                </div>
              )}

              {/* Current streak */}
              {preview.enabled && (
                <div className="bg-bg-surface rounded-card border border-border-light p-4 space-y-1">
                  <p className="text-lg text-text-secondary">{STREAK_LABEL}</p>
                  <p className="text-xl font-medium text-text-primary">
                    {preview.currentStreak}
                    {CONSECUTIVE_DAYS_SUFFIX}
                  </p>
                </div>
              )}

              {/* Activity trend */}
              {preview.enabled && (
                <div className="bg-bg-surface rounded-card border border-border-light p-4 space-y-2">
                  <p className="text-lg font-semibold text-text-primary">
                    {ACTIVITY_TREND_TITLE}
                  </p>
                  {preview.activityTrend.length > 0 ? (
                    <div className="divide-y divide-border-light">
                      {preview.activityTrend.map((entry) => (
                        <ActivityTrendItem key={entry.date} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-lg text-text-secondary">
                      {NO_DATA_MESSAGE}
                    </p>
                  )}
                </div>
              )}

              {/* Preview note */}
              {preview.enabled && (
                <div className="bg-accent-primary-light rounded-card border border-accent-primary/30 p-4">
                  <p className="text-lg text-text-primary text-center">
                    {PREVIEW_NOTE}
                  </p>
                </div>
              )}
            </>
          )}

          {/* No data state */}
          {!loading && !error && preview === null && (
            <div className="bg-bg-surface rounded-card border border-border-light p-4">
              <p className="text-lg text-text-secondary">{NO_DATA_MESSAGE}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
