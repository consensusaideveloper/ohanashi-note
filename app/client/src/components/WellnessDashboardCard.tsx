import { useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { useWellnessDashboard } from "../hooks/useWellnessDashboard";

import type { ReactNode } from "react";
import type { ActivityTrendEntry } from "../lib/wellness-api";

interface WellnessDashboardCardProps {
  creatorId: string;
  creatorName: string;
  onViewHistory: () => void;
}

/** Number of recent days shown in the activity trend row. */
const TREND_DAYS_COUNT = 7;

function formatDateLabel(dateString: string): string {
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return dateString;
  }
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return dateString;
  }
  return `${String(month)}/${String(day)}`;
}

function TrendDot({ entry }: { entry: ActivityTrendEntry }): ReactNode {
  const label = entry.hadConversation
    ? UI_MESSAGES.wellness.hadConversation
    : UI_MESSAGES.wellness.noConversation;

  return (
    <div className="flex flex-col items-center gap-1">
      {entry.hadConversation ? (
        <div
          className="w-6 h-6 rounded-full bg-accent-secondary"
          aria-label={label}
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full border-2 border-border"
          aria-label={label}
        />
      )}
      <span className="text-xs text-text-secondary">
        {formatDateLabel(entry.date)}
      </span>
    </div>
  );
}

export function WellnessDashboardCard({
  creatorId,
  creatorName,
  onViewHistory,
}: WellnessDashboardCardProps): ReactNode {
  const { dashboard, loading, error, refresh } =
    useWellnessDashboard(creatorId);

  const handleRetry = useCallback((): void => {
    refresh();
  }, [refresh]);

  const handleViewHistory = useCallback((): void => {
    onViewHistory();
  }, [onViewHistory]);

  // --- Loading state ---
  if (loading) {
    return (
      <section className="rounded-card border border-border bg-bg-surface p-4 space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {UI_MESSAGES.wellness.dashboardTitle}
        </h2>
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-3 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </section>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <section className="rounded-card border border-border bg-bg-surface p-4 space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {UI_MESSAGES.wellness.dashboardTitle}
        </h2>
        <div className="text-center py-4 space-y-3">
          <p className="text-lg text-text-secondary">
            {UI_MESSAGES.wellness.loadFailed}
          </p>
          <button
            type="button"
            className="min-h-11 px-6 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
            onClick={handleRetry}
          >
            もう一度読み込む
          </button>
        </div>
      </section>
    );
  }

  // --- Lifecycle not active ---
  if (dashboard?.lifecycleNotActive === true) {
    return (
      <section className="rounded-card border border-border bg-bg-surface p-4 space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {UI_MESSAGES.wellness.dashboardTitle}
        </h2>
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.wellness.lifecycleNotActive}
        </p>
      </section>
    );
  }

  // --- Not enabled ---
  if (dashboard === null || !dashboard.enabled) {
    return (
      <section className="rounded-card border border-border bg-bg-surface p-4 space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {UI_MESSAGES.wellness.dashboardTitle}
        </h2>
        <p className="text-lg text-text-secondary">
          見守りは利用されていません
        </p>
      </section>
    );
  }

  // --- Enabled dashboard content ---
  const lastConversationText =
    dashboard.lastConversationDate !== null
      ? formatDateLabel(dashboard.lastConversationDate)
      : UI_MESSAGES.wellness.noData;

  const recentTrend = dashboard.activityTrend.slice(0, TREND_DAYS_COUNT);

  return (
    <section className="rounded-card border border-border bg-bg-surface p-4 space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {UI_MESSAGES.wellness.dashboardTitle}
      </h2>

      {/* Inactive alert banner */}
      {dashboard.isInactive && (
        <div
          className="flex items-start gap-3 rounded-card bg-error-light border border-error px-4 py-3"
          role="alert"
        >
          {/* Warning icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-error flex-shrink-0 mt-0.5"
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
          <p className="text-lg text-error leading-relaxed">
            {creatorName}さんが{String(dashboard.inactiveDays)}
            {UI_MESSAGES.wellness.inactiveDays}
          </p>
        </div>
      )}

      {/* Last activity */}
      <div className="space-y-1">
        <p className="text-base text-text-secondary">
          {UI_MESSAGES.wellness.lastConversation}
        </p>
        <p className="text-lg text-text-primary">{lastConversationText}</p>
      </div>

      {/* Streak badge */}
      {dashboard.currentStreak > 0 && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-accent-secondary-light text-accent-secondary text-lg font-semibold">
            {String(dashboard.currentStreak)}
            {UI_MESSAGES.wellness.streakUnit}
            連続
          </span>
        </div>
      )}

      {/* Activity trend — last 7 days */}
      {recentTrend.length > 0 && (
        <div className="space-y-2">
          <p className="text-base text-text-secondary">
            {UI_MESSAGES.wellness.activityTrendTitle}
          </p>
          <div className="flex items-end justify-between gap-2">
            {recentTrend.map((entry) => (
              <TrendDot key={entry.date} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* View history button */}
      <button
        type="button"
        className="w-full min-h-11 rounded-full border border-accent-primary text-accent-primary bg-bg-surface text-lg transition-colors active:bg-accent-primary-light/30"
        onClick={handleViewHistory}
      >
        くわしい記録を見る
      </button>
    </section>
  );
}
