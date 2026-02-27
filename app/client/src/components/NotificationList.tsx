import { useCallback } from "react";

import type { ReactNode } from "react";
import type { Notification } from "../lib/family-api";

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const EMPTY_MESSAGE = "通知はありません";
const MARK_ALL_READ_LABEL = "すべて既読にする";

/** Milliseconds per minute. */
const MS_PER_MINUTE = 60_000;
/** Milliseconds per hour. */
const MS_PER_HOUR = 3_600_000;
/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

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

  const unreadBorderClass = notification.isRead
    ? "border-border-light"
    : "border-l-4 border-l-accent-primary border-t border-r border-b border-t-border-light border-r-border-light border-b-border-light";

  return (
    <button
      type="button"
      className={`w-full text-left rounded-card bg-bg-surface p-4 space-y-1 transition-colors active:bg-bg-surface-hover ${unreadBorderClass}`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`text-lg truncate ${notification.isRead ? "text-text-secondary" : "text-text-primary font-medium"}`}
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
}: NotificationListProps): ReactNode {
  const handleMarkAllRead = useCallback((): void => {
    onMarkAllRead();
  }, [onMarkAllRead]);

  const hasUnread = notifications.some((n) => !n.isRead);

  if (notifications.length === 0) {
    return (
      <div className="rounded-card border border-border-light bg-bg-surface p-6">
        <p className="text-lg text-text-secondary text-center">
          {EMPTY_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
    </div>
  );
}
