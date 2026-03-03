// Badge showing a milestone achievement (achieved or locked).

import type { ReactNode } from "react";

interface MilestoneBadgeProps {
  label: string;
  achieved: boolean;
}

export function MilestoneBadge({
  label,
  achieved,
}: MilestoneBadgeProps): ReactNode {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-2 min-h-11 whitespace-nowrap transition-colors ${
        achieved
          ? "bg-accent-primary/15 text-accent-primary"
          : "bg-border-light text-text-secondary"
      }`}
      aria-label={achieved ? `${label}（達成済み）` : `${label}（未達成）`}
    >
      {/* Checkmark or lock icon */}
      <svg
        className="w-5 h-5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        {achieved ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        )}
      </svg>
      <span className="text-lg font-semibold">{label}</span>
    </div>
  );
}
