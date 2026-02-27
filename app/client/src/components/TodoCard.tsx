import { UI_MESSAGES } from "../lib/constants";
import { TodoStatusBadge } from "./TodoStatusBadge";
import { TodoPriorityBadge } from "./TodoPriorityBadge";

import type { ReactNode } from "react";
import type { TodoItem } from "../lib/todo-api";

interface TodoCardProps {
  todo: TodoItem;
  onSelect: (todoId: string) => void;
}

export function TodoCard({ todo, onSelect }: TodoCardProps): ReactNode {
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
      className="w-full text-left rounded-card border border-border-light bg-bg-surface p-4 space-y-2 transition-colors active:bg-bg-surface-hover"
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

        <span className="text-base text-text-secondary">
          {todo.assigneeName ?? UI_MESSAGES.todo.unassigned}
        </span>

        {formattedDate && (
          <span className="text-base text-text-secondary">
            {UI_MESSAGES.todo.dueDateLabel}: {formattedDate}
          </span>
        )}
      </div>
    </button>
  );
}
