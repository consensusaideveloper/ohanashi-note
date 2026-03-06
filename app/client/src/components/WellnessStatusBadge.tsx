import { WELLNESS_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { WellnessShareLevel, WellnessStatus } from "../lib/wellness-api";

// --- Share level badge ---

const SHARE_LEVEL_STYLES: Record<WellnessShareLevel, string> = {
  basic: "bg-bg-surface-hover text-text-secondary",
  summary: "bg-accent-secondary-light text-accent-secondary-hover",
  detailed: "bg-accent-primary-light text-accent-primary-hover",
};

const SHARE_LEVEL_LABELS: Record<WellnessShareLevel, string> = {
  basic: WELLNESS_MESSAGES.shareLevel.basic,
  summary: WELLNESS_MESSAGES.shareLevel.summary,
  detailed: WELLNESS_MESSAGES.shareLevel.detailed,
};

interface WellnessShareLevelBadgeProps {
  level: WellnessShareLevel;
}

export function WellnessShareLevelBadge({
  level,
}: WellnessShareLevelBadgeProps): ReactNode {
  return (
    <span
      className={`inline-block rounded-full px-3 py-0.5 text-base font-medium ${SHARE_LEVEL_STYLES[level]}`}
    >
      {SHARE_LEVEL_LABELS[level]}
    </span>
  );
}

// --- Wellness status badge ---

const STATUS_STYLES: Record<WellnessStatus, string> = {
  stable: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  urgent: "bg-error-light text-error",
};

const STATUS_LABELS: Record<WellnessStatus, string> = {
  stable: WELLNESS_MESSAGES.familySummary.statusStable,
  warning: WELLNESS_MESSAGES.familySummary.statusWarning,
  urgent: WELLNESS_MESSAGES.familySummary.statusUrgent,
};

/** Prefix symbols to convey status without relying on color alone. */
const STATUS_PREFIXES: Record<WellnessStatus, string> = {
  stable: "○ ",
  warning: "△ ",
  urgent: "● ",
};

interface WellnessStatusIndicatorProps {
  status: WellnessStatus;
}

export function WellnessStatusIndicator({
  status,
}: WellnessStatusIndicatorProps): ReactNode {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-base font-medium ${STATUS_STYLES[status]}`}
      role="status"
    >
      {STATUS_PREFIXES[status]}
      {STATUS_LABELS[status]}
    </span>
  );
}
