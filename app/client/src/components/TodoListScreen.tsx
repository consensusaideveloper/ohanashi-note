import { useState, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { createTodo, generateTodos } from "../lib/todo-api";
import { useTodos } from "../hooks/useTodos";
import { useToast } from "../hooks/useToast";
import { TodoCard } from "./TodoCard";
import { TodoCreateDialog } from "./TodoCreateDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { TodoPriority } from "../lib/todo-api";

interface TodoListScreenProps {
  creatorId: string;
  creatorName: string;
  isRepresentative: boolean;
  onBack: () => void;
  onSelectTodo: (todoId: string) => void;
}

interface StatusFilterOption {
  value: string | null;
  label: string;
}

const STATUS_FILTERS: StatusFilterOption[] = [
  { value: null, label: UI_MESSAGES.todo.filterAll },
  { value: "pending", label: UI_MESSAGES.todo.statusPending },
  { value: "in_progress", label: UI_MESSAGES.todo.statusInProgress },
  { value: "completed", label: UI_MESSAGES.todo.statusCompleted },
];

export function TodoListScreen({
  creatorId,
  creatorName,
  isRepresentative,
  onBack,
  onSelectTodo,
}: TodoListScreenProps): ReactNode {
  const {
    todos,
    stats,
    isLoading,
    error,
    refresh,
    statusFilter,
    setStatusFilter,
  } = useTodos(creatorId);
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // --- Handlers ---

  const handleOpenCreate = useCallback((): void => {
    setShowCreateDialog(true);
  }, []);

  const handleCloseCreate = useCallback((): void => {
    setShowCreateDialog(false);
  }, []);

  const handleCreate = useCallback(
    (data: {
      title: string;
      description?: string;
      sourceCategory?: string;
      priority?: TodoPriority;
      assigneeId?: string;
      dueDate?: string;
    }): void => {
      setIsCreating(true);
      void createTodo(creatorId, data)
        .then(() => {
          showToast(UI_MESSAGES.todo.created, "success");
          setShowCreateDialog(false);
          refresh();
        })
        .catch((err: unknown) => {
          console.error("Failed to create todo:", { error: err, creatorId });
          showToast(UI_MESSAGES.todoError.createFailed, "error");
        })
        .finally(() => {
          setIsCreating(false);
        });
    },
    [creatorId, showToast, refresh],
  );

  const handleOpenGenerate = useCallback((): void => {
    setShowGenerateConfirm(true);
  }, []);

  const handleCloseGenerate = useCallback((): void => {
    setShowGenerateConfirm(false);
  }, []);

  const handleConfirmGenerate = useCallback((): void => {
    setShowGenerateConfirm(false);
    setIsGenerating(true);
    void generateTodos(creatorId)
      .then((generated) => {
        if (generated.length === 0) {
          showToast(UI_MESSAGES.todo.generateEmpty, "success");
        } else {
          showToast(UI_MESSAGES.todo.generated, "success");
        }
        refresh();
      })
      .catch((err: unknown) => {
        console.error("Failed to generate todos:", { error: err, creatorId });
        showToast(UI_MESSAGES.todoError.generateFailed, "error");
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [creatorId, showToast, refresh]);

  const progressPercent =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors active:bg-bg-surface-hover"
            onClick={onBack}
            aria-label="戻る"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-text-primary flex-1">
            {UI_MESSAGES.todo.pageTitle}
          </h1>
        </div>

        <p className="text-base text-text-secondary mb-3">{creatorName}さん</p>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="space-y-1 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-base text-text-secondary">
                {UI_MESSAGES.todo.progressLabel}
              </span>
              <span className="text-base text-text-secondary">
                {stats.completed}/{stats.total} ({progressPercent}%)
              </span>
            </div>
            <div className="bg-border-light rounded-full h-3">
              <div
                className="bg-accent-secondary rounded-full h-3 transition-all"
                style={{ width: `${String(progressPercent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value;
            const handleFilterClick = (): void => {
              setStatusFilter(filter.value);
            };
            return (
              <button
                key={filter.label}
                type="button"
                className={`min-h-11 px-4 rounded-full text-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-accent-primary text-text-on-accent"
                    : "bg-bg-surface border border-border-light text-text-secondary active:bg-bg-surface-hover"
                }`}
                onClick={handleFilterClick}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {/* Action buttons for representatives */}
          {isRepresentative && (
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
                onClick={handleOpenCreate}
              >
                {UI_MESSAGES.todo.createButton}
              </button>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-text-secondary text-lg transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                onClick={handleOpenGenerate}
                disabled={isGenerating}
              >
                {isGenerating
                  ? UI_MESSAGES.todo.generating
                  : UI_MESSAGES.todo.generateButton}
              </button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="text-center py-12 space-y-4">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.todoError.loadFailed}
              </p>
              <button
                type="button"
                className="min-h-11 px-6 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
                onClick={refresh}
              >
                もう一度読み込む
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && todos.length === 0 && (
            <div className="text-center py-12">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.todo.noTodos}
              </p>
            </div>
          )}

          {/* Todo list */}
          {!isLoading &&
            !error &&
            todos.map((todo) => (
              <TodoCard key={todo.id} todo={todo} onSelect={onSelectTodo} />
            ))}
        </div>
      </div>

      {/* Create dialog */}
      <TodoCreateDialog
        isOpen={showCreateDialog}
        onClose={handleCloseCreate}
        onCreate={handleCreate}
        isSubmitting={isCreating}
        familyMembers={[]}
      />

      <ConfirmDialog
        isOpen={showGenerateConfirm}
        title={UI_MESSAGES.todo.generateConfirmTitle}
        message={UI_MESSAGES.todo.generateConfirmMessage}
        confirmLabel="作成する"
        cancelLabel="もどる"
        variant="default"
        onConfirm={handleConfirmGenerate}
        onCancel={handleCloseGenerate}
      />

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </div>
  );
}
