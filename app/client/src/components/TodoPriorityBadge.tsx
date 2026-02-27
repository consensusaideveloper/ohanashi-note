import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { TodoPriority } from "../lib/todo-api";

interface TodoPriorityBadgeProps {
  priority: TodoPriority;
}

const PRIORITY_STYLES: Record<TodoPriority, string> = {
  high: "bg-error-light text-error",
  medium: "bg-warning-light text-accent-primary-hover",
  low: "bg-bg-surface-hover text-text-secondary",
};

const PRIORITY_LABELS: Record<TodoPriority, string> = {
  high: UI_MESSAGES.todo.priorityHigh,
  medium: UI_MESSAGES.todo.priorityMedium,
  low: UI_MESSAGES.todo.priorityLow,
};

export function TodoPriorityBadge({
  priority,
}: TodoPriorityBadgeProps): ReactNode {
  return (
    <span
      className={`inline-block rounded-full px-3 py-0.5 text-base font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
