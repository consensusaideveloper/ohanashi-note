import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  getTodoDetail,
  updateTodo,
  deleteTodo,
  addTodoComment,
  volunteerForTodo,
} from "../lib/todo-api";
import { useToast } from "../hooks/useToast";
import { TodoStatusBadge } from "./TodoStatusBadge";
import { TodoPriorityBadge } from "./TodoPriorityBadge";
import { TodoCommentThread } from "./TodoCommentThread";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type {
  TodoItem,
  TodoComment,
  TodoHistoryEntry,
  TodoStatus,
} from "../lib/todo-api";

interface TodoDetailScreenProps {
  creatorId: string;
  todoId: string;
  isRepresentative: boolean;
  onBack: () => void;
}

/** Maps history action types to Japanese descriptions. */
function formatHistoryAction(entry: TodoHistoryEntry): string {
  const metadata = entry.metadata;
  switch (entry.action) {
    case "created":
      return "作成";
    case "status_changed": {
      const to =
        metadata !== null && typeof metadata["to"] === "string"
          ? metadata["to"]
          : "";
      return `進み具合を「${to}」に変更`;
    }
    case "assigned":
      return "担当者を変更";
    case "priority_changed":
      return "優先度を変更";
    case "comment_added":
      return "メモを追加";
    case "due_date_changed":
      return "期限を変更";
    case "visibility_changed":
      return "表示設定を変更";
    default:
      return entry.action;
  }
}

export function TodoDetailScreen({
  creatorId,
  todoId,
  isRepresentative,
  onBack,
}: TodoDetailScreenProps): ReactNode {
  const [todo, setTodo] = useState<TodoItem | null>(null);
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [history, setHistory] = useState<TodoHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  // --- Data loading ---
  const loadDetail = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getTodoDetail(creatorId, todoId)
      .then((data) => {
        setTodo(data.todo);
        setComments(data.comments);
        setHistory(data.history);
      })
      .catch((err: unknown) => {
        console.error("Failed to load todo detail:", {
          error: err,
          creatorId,
          todoId,
        });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId, todoId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // --- Status change handlers ---
  const handleStatusChange = useCallback(
    (newStatus: TodoStatus): void => {
      setIsProcessing(true);
      void updateTodo(creatorId, todoId, { status: newStatus })
        .then((updated) => {
          setTodo(updated);
          showToast(UI_MESSAGES.todo.statusChanged, "success");
          loadDetail();
        })
        .catch((err: unknown) => {
          console.error("Failed to update todo status:", {
            error: err,
            creatorId,
            todoId,
          });
          showToast(UI_MESSAGES.todoError.updateFailed, "error");
        })
        .finally(() => {
          setIsProcessing(false);
        });
    },
    [creatorId, todoId, showToast, loadDetail],
  );

  const handleStart = useCallback((): void => {
    handleStatusChange("in_progress");
  }, [handleStatusChange]);

  const handleComplete = useCallback((): void => {
    handleStatusChange("completed");
  }, [handleStatusChange]);

  const handleReopen = useCallback((): void => {
    handleStatusChange("pending");
  }, [handleStatusChange]);

  // --- Volunteer handler ---
  const handleVolunteer = useCallback((): void => {
    setIsProcessing(true);
    void volunteerForTodo(creatorId, todoId)
      .then((updated) => {
        setTodo(updated);
        showToast(UI_MESSAGES.todo.volunteered, "success");
        loadDetail();
      })
      .catch((err: unknown) => {
        console.error("Failed to volunteer for todo:", {
          error: err,
          creatorId,
          todoId,
        });
        showToast(UI_MESSAGES.todoError.volunteerFailed, "error");
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [creatorId, todoId, showToast, loadDetail]);

  // --- Comment handler ---
  const handleAddComment = useCallback(
    (content: string): void => {
      setIsSubmittingComment(true);
      void addTodoComment(creatorId, todoId, content)
        .then((newComment) => {
          setComments((prev) => [...prev, newComment]);
          showToast(UI_MESSAGES.todo.commentAdded, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to add comment:", {
            error: err,
            creatorId,
            todoId,
          });
          showToast(UI_MESSAGES.todoError.commentFailed, "error");
        })
        .finally(() => {
          setIsSubmittingComment(false);
        });
    },
    [creatorId, todoId, showToast],
  );

  // --- Delete handlers ---
  const handleOpenDelete = useCallback((): void => {
    setShowDeleteConfirm(true);
  }, []);

  const handleCloseDelete = useCallback((): void => {
    setShowDeleteConfirm(false);
  }, []);

  const handleConfirmDelete = useCallback((): void => {
    setShowDeleteConfirm(false);
    setIsProcessing(true);
    void deleteTodo(creatorId, todoId)
      .then(() => {
        showToast(UI_MESSAGES.todo.deleted, "success");
        onBack();
      })
      .catch((err: unknown) => {
        console.error("Failed to delete todo:", {
          error: err,
          creatorId,
          todoId,
        });
        showToast(UI_MESSAGES.todoError.deleteFailed, "error");
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [creatorId, todoId, showToast, onBack]);

  // --- Formatted date ---
  const formattedDueDate =
    todo?.dueDate !== null && todo?.dueDate !== undefined
      ? new Date(todo.dueDate).toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
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
            {UI_MESSAGES.todo.detailTitle}
          </h1>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-6 max-w-lg mx-auto">
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
                {UI_MESSAGES.todoError.detailLoadFailed}
              </p>
              <button
                type="button"
                className="min-h-11 px-6 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
                onClick={loadDetail}
              >
                もう一度読み込む
              </button>
            </div>
          )}

          {/* Detail content */}
          {!isLoading && !error && todo !== null && (
            <>
              {/* Title and description */}
              <section className="space-y-2">
                <h2 className="text-xl font-semibold text-text-primary">
                  {todo.title}
                </h2>
                {todo.description !== null && (
                  <p className="text-lg text-text-secondary whitespace-pre-wrap">
                    {todo.description}
                  </p>
                )}
              </section>

              {/* Source note answer */}
              {todo.sourceAnswer !== null && (
                <section className="rounded-card border border-accent-secondary-light bg-accent-secondary-light p-4 space-y-1">
                  <p className="text-base font-medium text-accent-secondary-hover">
                    {UI_MESSAGES.todo.sourceNote}
                  </p>
                  <p className="text-lg text-text-primary whitespace-pre-wrap">
                    {todo.sourceAnswer}
                  </p>
                </section>
              )}

              {/* Status and action buttons */}
              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-base font-medium text-text-primary">
                    {UI_MESSAGES.todo.statusLabel}
                  </span>
                  <TodoStatusBadge status={todo.status} />
                </div>

                <div className="flex gap-2">
                  {todo.status === "pending" && (
                    <button
                      type="button"
                      className="min-h-11 px-6 rounded-full bg-info text-text-on-accent text-lg transition-colors active:opacity-80 disabled:opacity-50"
                      onClick={handleStart}
                      disabled={isProcessing}
                    >
                      {UI_MESSAGES.todo.startButton}
                    </button>
                  )}
                  {todo.status === "in_progress" && (
                    <button
                      type="button"
                      className="min-h-11 px-6 rounded-full bg-success text-text-on-accent text-lg transition-colors active:opacity-80 disabled:opacity-50"
                      onClick={handleComplete}
                      disabled={isProcessing}
                    >
                      {UI_MESSAGES.todo.completeButton}
                    </button>
                  )}
                  {todo.status === "completed" && (
                    <button
                      type="button"
                      className="min-h-11 px-6 rounded-full border border-border-light bg-bg-surface text-text-secondary text-lg transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                      onClick={handleReopen}
                      disabled={isProcessing}
                    >
                      {UI_MESSAGES.todo.reopenButton}
                    </button>
                  )}
                </div>
              </section>

              {/* Priority */}
              <section className="space-y-2">
                <span className="text-base font-medium text-text-primary">
                  {UI_MESSAGES.todo.priorityLabel}
                </span>
                <div>
                  <TodoPriorityBadge priority={todo.priority} />
                </div>
              </section>

              {/* Assignee */}
              <section className="space-y-2">
                <span className="text-base font-medium text-text-primary">
                  {UI_MESSAGES.todo.assigneeLabel}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-lg text-text-primary">
                    {todo.assigneeName ?? UI_MESSAGES.todo.noAssignee}
                  </span>
                  {todo.assigneeId === null && !isRepresentative && (
                    <button
                      type="button"
                      className="min-h-11 px-4 rounded-full border border-accent-secondary text-accent-secondary bg-bg-surface text-lg transition-colors active:bg-success-light disabled:opacity-50"
                      onClick={handleVolunteer}
                      disabled={isProcessing}
                    >
                      {UI_MESSAGES.todo.volunteerButton}
                    </button>
                  )}
                </div>
              </section>

              {/* Due date */}
              {formattedDueDate !== null && (
                <section className="space-y-2">
                  <span className="text-base font-medium text-text-primary">
                    {UI_MESSAGES.todo.dueDateLabel}
                  </span>
                  <p className="text-lg text-text-primary">
                    {formattedDueDate}
                  </p>
                </section>
              )}

              {/* Comment thread */}
              <TodoCommentThread
                comments={comments}
                onAddComment={handleAddComment}
                isSubmitting={isSubmittingComment}
              />

              {/* History timeline */}
              {history.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-text-primary">
                    {UI_MESSAGES.todo.historyTitle}
                  </h3>
                  <div className="border-l-2 border-border-light pl-4 space-y-3">
                    {history.map((entry) => (
                      <div key={entry.id} className="space-y-1">
                        <p className="text-base text-text-secondary">
                          {formatHistoryAction(entry)} &mdash;{" "}
                          {entry.performedByName ??
                            UI_MESSAGES.todo.deletedUser}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {new Date(entry.createdAt).toLocaleDateString(
                            "ja-JP",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Delete button (representative only) */}
              {isRepresentative && (
                <section className="pt-4 border-t border-border">
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full border border-error text-error bg-bg-surface text-lg transition-colors active:bg-error-light disabled:opacity-50"
                    onClick={handleOpenDelete}
                    disabled={isProcessing}
                  >
                    {UI_MESSAGES.todo.deleteConfirmTitle}
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={UI_MESSAGES.todo.deleteConfirmTitle}
        message={UI_MESSAGES.todo.deleteConfirmMessage}
        confirmLabel="削除する"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCloseDelete}
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
