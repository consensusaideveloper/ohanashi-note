import { useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { Notification } from "../lib/family-api";

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

const MARK_ALL_READ_LABEL = "すべて既読にする";

/** Milliseconds per minute. */
const MS_PER_MINUTE = 60_000;
/** Milliseconds per hour. */
const MS_PER_HOUR = 3_600_000;
/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

/** Notification types that require user action. */
const CRITICAL_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "death_reported",
  "consent_requested",
  "deletion_consent_requested",
]);

/** Notification types with elevated importance. */
const IMPORTANT_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "note_opened",
  "data_deleted",
  "creator_account_deleted",
  "death_report_cancelled",
  "consent_reset",
]);

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffMs = now - date;

  if (diffMs < MS_PER_MINUTE) {
    return "たった今";
  }
  if (diffMs < MS_PER_HOUR) {
    const minutes = Math.floor(diffMs / MS_PER_MINUTE);
    return `${String(minutes)}分前`;
  }
  if (diffMs < MS_PER_DAY) {
    const hours = Math.floor(diffMs / MS_PER_HOUR);
    return `${String(hours)}時間前`;
  }
  const days = Math.floor(diffMs / MS_PER_DAY);
  return `${String(days)}日前`;
}

function getUnreadBorderClass(type: string): string {
  if (CRITICAL_NOTIFICATION_TYPES.has(type)) {
    return "border-l-4 border-l-error border-t border-r border-b border-t-border-light border-r-border-light border-b-border-light";
  }
  if (IMPORTANT_NOTIFICATION_TYPES.has(type)) {
    return "border-l-4 border-l-warning border-t border-r border-b border-t-border-light border-r-border-light border-b-border-light";
  }
  return "border-l-4 border-l-accent-primary border-t border-r border-b border-t-border-light border-r-border-light border-b-border-light";
}

interface NotificationCardProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

function NotificationCard({
  notification,
  onMarkRead,
}: NotificationCardProps): ReactNode {
  const handleClick = useCallback((): void => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
  }, [notification.id, notification.isRead, onMarkRead]);

  const borderClass = notification.isRead
    ? "border-border-light"
    : getUnreadBorderClass(notification.type);

  const isCritical =
    !notification.isRead && CRITICAL_NOTIFICATION_TYPES.has(notification.type);

  return (
    <button
      type="button"
      className={`w-full text-left rounded-card bg-bg-surface p-4 space-y-1 transition-colors active:bg-bg-surface-hover ${borderClass}`}
      onClick={handleClick}
    >
      {isCritical && (
        <span className="text-error text-base font-medium">
          {UI_MESSAGES.family.notificationCriticalLabel}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`text-lg ${notification.isRead ? "text-text-secondary" : "text-text-primary font-medium"}`}
        >
          {notification.title}
        </h3>
        <span className="text-base text-text-secondary flex-none">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </div>
      <p
        className={`text-lg leading-relaxed ${notification.isRead ? "text-text-secondary" : "text-text-primary"}`}
      >
        {notification.message}
      </p>
    </button>
  );
}

export function NotificationList({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: NotificationListProps): ReactNode {
  const handleMarkAllRead = useCallback((): void => {
    onMarkAllRead();
  }, [onMarkAllRead]);

  const handleClose = useCallback((): void => {
    onClose();
  }, [onClose]);

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="space-y-3">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {UI_MESSAGES.family.notificationBellLabel}
        </h2>
        <button
          type="button"
          className="min-h-11 inline-flex items-center gap-1 rounded-full px-3 text-lg text-text-secondary transition-colors active:bg-bg-surface-hover"
          onClick={handleClose}
          aria-label={UI_MESSAGES.family.notificationCloseLabel}
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          {UI_MESSAGES.family.notificationCloseLabel}
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-card border border-border-light bg-bg-surface p-6">
          <p className="text-lg text-text-secondary text-center">
            {UI_MESSAGES.family.noNotifications}
          </p>
        </div>
      ) : (
        <>
          {hasUnread && (
            <div className="flex justify-end">
              <button
                type="button"
                className="min-h-11 rounded-full border border-border-light bg-bg-surface px-4 text-lg text-text-secondary transition-colors active:bg-bg-surface-hover"
                onClick={handleMarkAllRead}
              >
                {MARK_ALL_READ_LABEL}
              </button>
            </div>
          )}

          <ul className="space-y-3">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationCard
                  notification={notification}
                  onMarkRead={onMarkRead}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
