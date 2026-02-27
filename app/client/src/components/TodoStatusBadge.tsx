import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { TodoStatus } from "../lib/todo-api";

interface TodoStatusBadgeProps {
  status: TodoStatus;
}

const STATUS_STYLES: Record<TodoStatus, string> = {
  pending: "bg-warning-light text-accent-primary-hover",
  in_progress: "bg-info-light text-info",
  completed: "bg-success-light text-success",
};

const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: UI_MESSAGES.todo.statusPending,
  in_progress: UI_MESSAGES.todo.statusInProgress,
  completed: UI_MESSAGES.todo.statusCompleted,
};

export function TodoStatusBadge({ status }: TodoStatusBadgeProps): ReactNode {
  return (
    <span
      className={`inline-block rounded-full px-3 py-0.5 text-base font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
