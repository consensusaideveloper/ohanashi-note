import { useCallback } from "react";

import { WELLNESS_MESSAGES } from "../lib/constants";
import { useWellnessSummary } from "../hooks/useWellnessSummary";
import { WellnessStatusIndicator } from "./WellnessStatusBadge";

import type { ReactNode } from "react";
import type { WellnessStatus } from "../lib/wellness-api";

// --- Constants ---

const BORDER_BY_STATUS: Record<WellnessStatus, string> = {
  stable: "border-border-light",
  warning: "border-warning",
  urgent: "border-error",
};

const DAYS_IN_WEEK = 7;

// --- Component ---

interface FamilyWellnessSummaryCardProps {
  creatorId: string;
  creatorName: string;
}

export function FamilyWellnessSummaryCard({
  creatorId,
  creatorName,
}: FamilyWellnessSummaryCardProps): ReactNode {
  const { summary, isLoading, error, refresh } = useWellnessSummary(creatorId);

  const handleRetry = useCallback((): void => {
    refresh();
  }, [refresh]);

  if (isLoading) {
    return (
      <div
        className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3 animate-pulse"
        role="status"
        aria-label={WELLNESS_MESSAGES.settings.loadingText}
      >
        <div className="h-6 bg-bg-surface-hover rounded w-2/3" />
        <div className="h-5 bg-bg-surface-hover rounded w-1/2" />
        <div className="h-5 bg-bg-surface-hover rounded w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-error-light bg-error-light p-4 space-y-3">
        <p className="text-lg text-error" role="alert">
          ● {WELLNESS_MESSAGES.familySummary.loadFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full border border-error text-error bg-bg-surface px-6 text-lg transition-colors active:bg-error-light"
          onClick={handleRetry}
        >
          {WELLNESS_MESSAGES.familySummary.retryButton}
        </button>
      </div>
    );
  }

  if (summary === null) {
    return (
      <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
        <h3 className="text-lg font-semibold text-text-primary">
          {creatorName}の{WELLNESS_MESSAGES.familySummary.title}
        </h3>
        <p className="text-lg text-text-secondary">
          {WELLNESS_MESSAGES.familySummary.noData}
        </p>
        <p className="text-lg text-text-secondary leading-relaxed">
          {WELLNESS_MESSAGES.familySummary.notEnabledDescription}
        </p>
      </div>
    );
  }

  const borderColor = BORDER_BY_STATUS[summary.status];

  return (
    <div
      className={`rounded-card border ${borderColor} bg-bg-surface p-4 space-y-3`}
      aria-live="polite"
    >
      {/* Header row: creator name + status badge */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary">
          {creatorName}の{WELLNESS_MESSAGES.familySummary.title}
        </h3>
        <WellnessStatusIndicator status={summary.status} />
      </div>

      {/* Engaged days */}
      <p className="text-lg text-text-primary">
        {WELLNESS_MESSAGES.familySummary.engagedDaysLabel}:{" "}
        <span className="font-semibold">{String(summary.engagedDays)}日</span> /{" "}
        {String(DAYS_IN_WEEK)}日
      </p>

      {/* Missed streak for warning/urgent */}
      {summary.missedStreak > 0 && summary.status !== "stable" && (
        <p
          className={`text-lg ${summary.status === "urgent" ? "text-error" : "text-warning"}`}
        >
          {summary.status === "urgent" ? "● " : "△ "}
          {WELLNESS_MESSAGES.familySummary.missedStreakLabel}:{" "}
          <span className="font-semibold">
            {String(summary.missedStreak)}
            {WELLNESS_MESSAGES.familySummary.daysUnit}
          </span>
        </p>
      )}

      {/* Summary text */}
      <p className="text-lg text-text-primary leading-relaxed">
        {summary.summary}
      </p>

      {/* Recommended action for warning/urgent */}
      {summary.status === "warning" && (
        <p className="text-lg text-warning leading-relaxed">
          △ {WELLNESS_MESSAGES.familySummary.warningAction}
        </p>
      )}
      {summary.status === "urgent" && (
        <p className="text-lg text-error font-medium leading-relaxed">
          ● {WELLNESS_MESSAGES.familySummary.urgentAction}
        </p>
      )}

      {/* Highlights */}
      {summary.highlights.length > 0 && (
        <div className="space-y-1">
          <p className="text-base text-text-secondary">
            {WELLNESS_MESSAGES.familySummary.highlightsLabel}
          </p>
          <ul className="list-disc list-inside space-y-1">
            {summary.highlights.map((highlight, index) => (
              <li
                key={`highlight-${String(index)}`}
                className="text-lg text-text-primary"
              >
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Period */}
      <p className="text-base text-text-secondary">
        {WELLNESS_MESSAGES.familySummary.periodLabel}: {summary.weekStart} 〜{" "}
        {summary.weekEnd}
      </p>
    </div>
  );
}
