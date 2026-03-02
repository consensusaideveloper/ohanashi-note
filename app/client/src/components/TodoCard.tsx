import { UI_MESSAGES } from "../lib/constants";
import { TodoStatusBadge } from "./TodoStatusBadge";
import { TodoPriorityBadge } from "./TodoPriorityBadge";

import type { ReactNode } from "react";
import type { TodoItem } from "../lib/todo-api";

interface TodoCardProps {
  todo: TodoItem;
  isMyTask: boolean;
  onSelect: (todoId: string) => void;
}

export function TodoCard({
  todo,
  isMyTask,
  onSelect,
}: TodoCardProps): ReactNode {
  const handleClick = (): void => {
    onSelect(todo.id);
  };

  const formattedDate = todo.dueDate
    ? new Date(todo.dueDate).toLocaleDateString("ja-JP", {
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <button
      type="button"
      className={`w-full text-left rounded-card border p-4 space-y-2 transition-colors active:bg-bg-surface-hover ${
        isMyTask
          ? "border-accent-secondary bg-accent-secondary-light"
          : "border-border-light bg-bg-surface"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-lg font-semibold text-text-primary leading-snug">
          {todo.title}
        </h3>
        <TodoPriorityBadge priority={todo.priority} />
      </div>

      {todo.description && (
        <p className="text-base text-text-secondary line-clamp-2">
          {todo.description}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <TodoStatusBadge status={todo.status} />

        {isMyTask ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-accent-secondary text-text-on-accent">
            {UI_MESSAGES.todo.myTaskBadge}
          </span>
        ) : (
          <span className="text-base text-text-secondary">
            {todo.assigneeName ?? UI_MESSAGES.todo.unassigned}
          </span>
        )}

        {formattedDate && (
          <span className="text-base text-text-secondary">
            {UI_MESSAGES.todo.dueDateLabel}: {formattedDate}
          </span>
        )}
      </div>
    </button>
  );
}
