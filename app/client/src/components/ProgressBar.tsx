// Horizontal progress bar for ending-note category completion.

import type { ReactNode } from "react";

interface ProgressBarProps {
  answered: number;
  total: number;
  /** Use compact height variant for list items. */
  compact?: boolean;
}

/** Minimum visible width (%) so a tiny sliver is always shown when answered > 0. */
const MIN_VISIBLE_PERCENT = 3;

export function ProgressBar({
  answered,
  total,
  compact = false,
}: ProgressBarProps): ReactNode {
  const percentage = total > 0 ? (answered / total) * 100 : 0;
  const isComplete = answered >= total && total > 0;

  // Ensure a tiny sliver is visible when there's any progress at all
  const displayPercent =
    percentage > 0 && percentage < MIN_VISIBLE_PERCENT
      ? MIN_VISIBLE_PERCENT
      : percentage;

  const heightClass = compact ? "h-2" : "h-3";

  return (
    <div
      className={`w-full ${heightClass} rounded-full bg-progress-track overflow-hidden`}
      role="progressbar"
      aria-valuenow={answered}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${answered}/${total}項目完了`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${
          isComplete ? "bg-progress-complete" : "bg-progress-fill"
        }`}
        style={{ width: `${displayPercent}%` }}
      />
    </div>
  );
}
