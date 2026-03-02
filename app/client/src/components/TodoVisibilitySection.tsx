import { useState, useCallback, useMemo } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { updateTodoVisibility } from "../lib/todo-api";

import type { ReactNode } from "react";
import type { TodoVisibilityMember } from "../lib/todo-api";

interface TodoVisibilitySectionProps {
  creatorId: string;
  todoId: string;
  members: TodoVisibilityMember[];
  onUpdate: (members: TodoVisibilityMember[]) => void;
  showToast: (message: string, variant: "success" | "error") => void;
}

export function TodoVisibilitySection({
  creatorId,
  todoId,
  members,
  onUpdate,
  showToast,
}: TodoVisibilitySectionProps): ReactNode {
  const [isExpanded, setIsExpanded] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const visibleCount = useMemo(
    () => members.filter((m) => !m.hidden).length,
    [members],
  );

  const summaryText =
    visibleCount > 0
      ? `${String(visibleCount)}${UI_MESSAGES.todo.visibilitySummary}`
      : UI_MESSAGES.todo.visibilityAllHidden;

  const handleToggleExpand = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleToggleVisibility = useCallback(
    (familyMemberId: string, currentHidden: boolean): void => {
      const newHidden = !currentHidden;

      // Optimistic update
      const updatedMembers = members.map((m) =>
        m.familyMemberId === familyMemberId ? { ...m, hidden: newHidden } : m,
      );
      onUpdate(updatedMembers);

      setTogglingIds((prev) => new Set(prev).add(familyMemberId));

      void updateTodoVisibility(creatorId, todoId, familyMemberId, newHidden)
        .then(() => {
          showToast(UI_MESSAGES.todo.visibilityUpdated, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to update visibility:", {
            error: err,
            creatorId,
            todoId,
            familyMemberId,
          });
          // Revert optimistic update
          onUpdate(members);
          showToast(UI_MESSAGES.todoError.visibilityFailed, "error");
        })
        .finally(() => {
          setTogglingIds((prev) => {
            const next = new Set(prev);
            next.delete(familyMemberId);
            return next;
          });
        });
    },
    [creatorId, todoId, members, onUpdate, showToast],
  );

  return (
    <section className="space-y-2">
      <button
        type="button"
        className="w-full min-h-11 flex items-center justify-between rounded-card px-4 py-3 transition-colors active:bg-bg-surface-hover"
        onClick={handleToggleExpand}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 text-text-secondary transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
          <span className="text-base font-medium text-text-primary">
            {UI_MESSAGES.todo.visibilityTitle}
          </span>
        </div>
        <span className="text-base text-text-secondary">{summaryText}</span>
      </button>

      {isExpanded && (
        <div className="space-y-2 px-2">
          <p className="text-base text-text-secondary px-2">
            {UI_MESSAGES.todo.visibilityDescription}
          </p>
          {members.map((member) => {
            const isToggling = togglingIds.has(member.familyMemberId);
            const handleClick = (): void => {
              handleToggleVisibility(member.familyMemberId, member.hidden);
            };
            return (
              <div
                key={member.familyMemberId}
                className="flex items-center justify-between px-2 py-2"
              >
                <span className="text-lg text-text-primary">
                  {member.memberName}
                </span>
                <button
                  type="button"
                  className={`min-h-11 min-w-20 px-4 rounded-full border text-lg transition-colors disabled:opacity-50 ${
                    member.hidden
                      ? "bg-bg-surface-hover text-text-secondary border-border-light"
                      : "bg-success-light text-success border-success"
                  }`}
                  onClick={handleClick}
                  disabled={isToggling}
                  aria-label={`${member.memberName}さんの表示を切り替える`}
                >
                  {isToggling ? (
                    <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : member.hidden ? (
                    UI_MESSAGES.todo.hidden
                  ) : (
                    UI_MESSAGES.todo.visible
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
