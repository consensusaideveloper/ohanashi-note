import { useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

interface NotificationBellProps {
  count: number;
  isOpen: boolean;
  onClick: () => void;
}

export function NotificationBell({
  count,
  isOpen,
  onClick,
}: NotificationBellProps): ReactNode {
  const handleClick = useCallback((): void => {
    onClick();
  }, [onClick]);

  return (
    <button
      type="button"
      className="relative inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full border border-border-light bg-bg-surface text-text-secondary text-lg font-medium transition-colors active:bg-bg-surface-hover flex-none"
      onClick={handleClick}
      aria-label={UI_MESSAGES.family.notificationBellLabel}
      aria-expanded={isOpen}
    >
      <svg
        className="w-5 h-5 flex-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {UI_MESSAGES.family.notificationBellLabel}
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 flex items-center justify-center rounded-full bg-error text-text-on-accent text-sm font-bold px-1">
          {count}
        </span>
      )}
    </button>
  );
}
