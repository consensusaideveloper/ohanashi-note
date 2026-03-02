import { useState, useEffect, useCallback, useMemo } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  getTodoDetail,
  updateTodo,
  deleteTodo,
  addTodoComment,
  volunteerForTodo,
  listTodoMembers,
} from "../lib/todo-api";
import { useToast } from "../hooks/useToast";
import { TodoStatusBadge } from "./TodoStatusBadge";
import { TodoPriorityBadge } from "./TodoPriorityBadge";
import { TodoCommentThread } from "./TodoCommentThread";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";
import { WheelPicker } from "./WheelPicker";
import { DatePicker } from "./DatePicker";
import { TodoVisibilitySection } from "./TodoVisibilitySection";

import type { ReactNode } from "react";
import type {
  TodoItem,
  TodoComment,
  TodoHistoryEntry,
  TodoStatus,
  TodoPriority,
  TodoMember,
  TodoVisibilityMember,
} from "../lib/todo-api";
import type { WheelPickerOption } from "./WheelPicker";

interface TodoDetailScreenProps {
  creatorId: string;
  todoId: string;
  isRepresentative: boolean;
  onBack: () => void;
  onViewSourceNote?: (category: string) => void;
}

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: UI_MESSAGES.todo.statusPending,
  in_progress: UI_MESSAGES.todo.statusInProgress,
  completed: UI_MESSAGES.todo.statusCompleted,
};

const PRIORITY_LABEL_MAP: Record<string, string> = {
  high: UI_MESSAGES.todo.priorityHigh,
  medium: UI_MESSAGES.todo.priorityMedium,
  low: UI_MESSAGES.todo.priorityLow,
};

const PRIORITY_OPTIONS: Array<{ value: TodoPriority; label: string }> = [
  { value: "high", label: UI_MESSAGES.todo.priorityHigh },
  { value: "medium", label: UI_MESSAGES.todo.priorityMedium },
  { value: "low", label: UI_MESSAGES.todo.priorityLow },
];

const PRIORITY_ACTIVE_STYLES: Record<TodoPriority, string> = {
  high: "bg-error-light text-error border-error",
  medium: "bg-warning-light text-accent-primary-hover border-accent-primary",
  low: "bg-bg-surface-hover text-text-secondary border-text-secondary",
};

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
      const statusLabel = STATUS_LABEL_MAP[to] ?? to;
      return `進み具合を「${statusLabel}」に変更`;
    }
    case "assigned":
      return "担当者を変更";
    case "priority_changed": {
      const to =
        metadata !== null && typeof metadata["to"] === "string"
          ? metadata["to"]
          : "";
      const priorityLabel = PRIORITY_LABEL_MAP[to] ?? to;
      return `大事さを「${priorityLabel}」に変更`;
    }
    case "comment_added":
      return "メモを追加";
    case "due_date_changed":
      return "期限を変更";
    case "visibility_changed":
      return "表示設定を変更";
    case "title_changed":
      return UI_MESSAGES.todo.historyTitleChanged;
    case "description_changed":
      return UI_MESSAGES.todo.historyDescriptionChanged;
    default:
      return entry.action;
  }
}

export function TodoDetailScreen({
  creatorId,
  todoId,
  isRepresentative,
  onBack,
  onViewSourceNote,
}: TodoDetailScreenProps): ReactNode {
  const [todo, setTodo] = useState<TodoItem | null>(null);
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [history, setHistory] = useState<TodoHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [visibilityMembers, setVisibilityMembers] = useState<
    TodoVisibilityMember[]
  >([]);

  // Edit states for representative
  const [todoMembers, setTodoMembers] = useState<TodoMember[]>([]);
  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const assigneeOptions: readonly WheelPickerOption[] = useMemo(
    () => [
      { value: "", label: UI_MESSAGES.todo.noAssignee },
      ...todoMembers.map((m) => ({
        value: m.familyMemberId,
        label: m.name,
      })),
    ],
    [todoMembers],
  );

  // --- Data loading ---
  const loadDetail = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getTodoDetail(creatorId, todoId)
      .then((data) => {
        setTodo(data.todo);
        setComments(data.comments);
        setHistory(data.history);
        setVisibilityMembers(data.visibility ?? []);
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

  // Fetch family members for assignee picker (representative only)
  useEffect(() => {
    if (!isRepresentative) return;
    void listTodoMembers(creatorId)
      .then((members) => {
        setTodoMembers(members);
      })
      .catch((err: unknown) => {
        console.error("Failed to load family members:", {
          error: err,
          creatorId,
        });
      });
  }, [creatorId, isRepresentative]);

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

  // --- Assignee change handler (representative) ---
  const handleOpenAssigneePicker = useCallback((): void => {
    setIsAssigneePickerOpen(true);
  }, []);

  const handleCloseAssigneePicker = useCallback((): void => {
    setIsAssigneePickerOpen(false);
  }, []);

  const handleAssigneeConfirm = useCallback(
    (selectedValue: string): void => {
      setIsAssigneePickerOpen(false);
      const newAssigneeId = selectedValue.length > 0 ? selectedValue : null;
      if (newAssigneeId === (todo?.assigneeId ?? null)) return;
      setIsProcessing(true);
      void updateTodo(creatorId, todoId, { assigneeId: newAssigneeId })
        .then((updated) => {
          setTodo(updated);
          showToast(UI_MESSAGES.todo.assigned, "success");
          loadDetail();
        })
        .catch((err: unknown) => {
          console.error("Failed to update assignee:", {
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
    [creatorId, todoId, todo?.assigneeId, showToast, loadDetail],
  );

  // --- Priority change handler (representative) ---
  const handlePriorityChange = useCallback(
    (newPriority: TodoPriority): void => {
      if (newPriority === todo?.priority) return;
      setIsProcessing(true);
      void updateTodo(creatorId, todoId, { priority: newPriority })
        .then((updated) => {
          setTodo(updated);
          showToast(UI_MESSAGES.todo.updated, "success");
          loadDetail();
        })
        .catch((err: unknown) => {
          console.error("Failed to update priority:", {
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
    [creatorId, todoId, todo?.priority, showToast, loadDetail],
  );

  // --- Due date change handler (representative) ---
  const handleOpenDatePicker = useCallback((): void => {
    setIsDatePickerOpen(true);
  }, []);

  const handleCloseDatePicker = useCallback((): void => {
    setIsDatePickerOpen(false);
  }, []);

  const handleDateConfirm = useCallback(
    (selectedDate: string): void => {
      setIsDatePickerOpen(false);
      const newDueDate = selectedDate.length > 0 ? selectedDate : null;
      setIsProcessing(true);
      void updateTodo(creatorId, todoId, { dueDate: newDueDate })
        .then((updated) => {
          setTodo(updated);
          showToast(UI_MESSAGES.todo.updated, "success");
          loadDetail();
        })
        .catch((err: unknown) => {
          console.error("Failed to update due date:", {
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

  // --- Title/description edit handlers (representative) ---
  const handleStartEdit = useCallback((): void => {
    if (todo === null) return;
    setEditTitle(todo.title);
    setEditDescription(todo.description ?? "");
    setIsEditingContent(true);
  }, [todo]);

  const handleCancelEdit = useCallback((): void => {
    setIsEditingContent(false);
  }, []);

  const handleSaveEdit = useCallback((): void => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle.length === 0) return;
    const trimmedDescription = editDescription.trim();
    const newDescription =
      trimmedDescription.length > 0 ? trimmedDescription : null;

    setIsProcessing(true);
    setIsEditingContent(false);
    void updateTodo(creatorId, todoId, {
      title: trimmedTitle,
      description: newDescription,
    })
      .then((updated) => {
        setTodo(updated);
        showToast(UI_MESSAGES.todo.updated, "success");
        loadDetail();
      })
      .catch((err: unknown) => {
        console.error("Failed to update todo content:", {
          error: err,
          creatorId,
          todoId,
        });
        showToast(UI_MESSAGES.todoError.updateFailed, "error");
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [creatorId, todoId, editTitle, editDescription, showToast, loadDetail]);

  const handleEditTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setEditTitle(e.target.value);
    },
    [],
  );

  const handleEditDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      setEditDescription(e.target.value);
    },
    [],
  );

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

  // --- History collapse ---
  const VISIBLE_HISTORY_COUNT = 3;
  const hasHiddenHistory =
    !showAllHistory && history.length > VISIBLE_HISTORY_COUNT;
  const visibleHistory = useMemo(
    () =>
      hasHiddenHistory
        ? history.slice(history.length - VISIBLE_HISTORY_COUNT)
        : history,
    [history, hasHiddenHistory],
  );

  const handleShowAllHistory = useCallback((): void => {
    setShowAllHistory(true);
  }, []);

  const handleViewSourceNote = useCallback((): void => {
    if (todo?.sourceCategory !== null && todo?.sourceCategory !== undefined) {
      onViewSourceNote?.(todo.sourceCategory);
    }
  }, [todo, onViewSourceNote]);

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
                {isEditingContent ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="edit-title"
                        className="text-base font-medium text-text-primary"
                      >
                        {UI_MESSAGES.todo.titleLabel}
                      </label>
                      <input
                        id="edit-title"
                        type="text"
                        className="w-full min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none"
                        value={editTitle}
                        onChange={handleEditTitleChange}
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="edit-description"
                        className="text-base font-medium text-text-primary"
                      >
                        {UI_MESSAGES.todo.descriptionLabel}
                      </label>
                      <textarea
                        id="edit-description"
                        className="w-full min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none resize-none"
                        value={editDescription}
                        onChange={handleEditDescriptionChange}
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
                        onClick={handleCancelEdit}
                      >
                        {UI_MESSAGES.todo.cancelEditButton}
                      </button>
                      <button
                        type="button"
                        className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover disabled:opacity-50"
                        onClick={handleSaveEdit}
                        disabled={isProcessing || editTitle.trim().length === 0}
                      >
                        {UI_MESSAGES.todo.saveButton}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <h2 className="text-xl font-semibold text-text-primary flex-1">
                        {todo.title}
                      </h2>
                      {isRepresentative && (
                        <button
                          type="button"
                          className="min-h-11 px-4 rounded-full border border-border-light bg-bg-surface text-base text-text-secondary transition-colors active:bg-bg-surface-hover"
                          onClick={handleStartEdit}
                        >
                          {UI_MESSAGES.todo.editButton}
                        </button>
                      )}
                    </div>
                    {todo.description !== null && (
                      <p className="text-lg text-text-secondary whitespace-pre-wrap">
                        {todo.description}
                      </p>
                    )}
                  </>
                )}
              </section>

              {/* Source note answer */}
              {todo.sourceAnswer !== null &&
                (todo.sourceCategory !== null &&
                onViewSourceNote !== undefined ? (
                  <button
                    type="button"
                    className="w-full rounded-card border border-accent-secondary-light bg-accent-secondary-light p-4 space-y-1 text-left transition-colors active:opacity-80"
                    onClick={handleViewSourceNote}
                    aria-label={UI_MESSAGES.todo.viewSourceNote}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-base font-medium text-accent-secondary-hover">
                        {UI_MESSAGES.todo.sourceNote}
                      </p>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-accent-secondary-hover flex-none"
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
                    </div>
                    <p className="text-lg text-text-primary whitespace-pre-wrap">
                      {todo.sourceAnswer}
                    </p>
                  </button>
                ) : (
                  <section className="rounded-card border border-accent-secondary-light bg-accent-secondary-light p-4 space-y-1">
                    <p className="text-base font-medium text-accent-secondary-hover">
                      {UI_MESSAGES.todo.sourceNote}
                    </p>
                    <p className="text-lg text-text-primary whitespace-pre-wrap">
                      {todo.sourceAnswer}
                    </p>
                  </section>
                ))}

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
                {isRepresentative ? (
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map((option) => {
                      const isActive = todo.priority === option.value;
                      const handleSelectPriority = (): void => {
                        handlePriorityChange(option.value);
                      };
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`min-h-11 flex-1 rounded-full border text-lg transition-colors disabled:opacity-50 ${
                            isActive
                              ? PRIORITY_ACTIVE_STYLES[option.value]
                              : "border-border-light text-text-secondary bg-bg-surface active:bg-bg-surface-hover"
                          }`}
                          onClick={handleSelectPriority}
                          disabled={isProcessing}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <TodoPriorityBadge priority={todo.priority} />
                  </div>
                )}
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
                  {isRepresentative ? (
                    <button
                      type="button"
                      className="min-h-11 px-4 rounded-full border border-border-light bg-bg-surface text-base text-text-secondary transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                      onClick={handleOpenAssigneePicker}
                      disabled={isProcessing}
                    >
                      {UI_MESSAGES.todo.changeButton}
                    </button>
                  ) : (
                    todo.assigneeId === null && (
                      <button
                        type="button"
                        className="min-h-11 px-4 rounded-full border border-accent-secondary text-accent-secondary bg-bg-surface text-lg transition-colors active:bg-success-light disabled:opacity-50"
                        onClick={handleVolunteer}
                        disabled={isProcessing}
                      >
                        {UI_MESSAGES.todo.volunteerButton}
                      </button>
                    )
                  )}
                </div>
              </section>

              {/* Due date */}
              <section className="space-y-2">
                <span className="text-base font-medium text-text-primary">
                  {UI_MESSAGES.todo.dueDateLabel}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-lg text-text-primary">
                    {formattedDueDate ?? UI_MESSAGES.todo.noDueDate}
                  </span>
                  {isRepresentative && (
                    <button
                      type="button"
                      className="min-h-11 px-4 rounded-full border border-border-light bg-bg-surface text-base text-text-secondary transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                      onClick={handleOpenDatePicker}
                      disabled={isProcessing}
                    >
                      {UI_MESSAGES.todo.changeButton}
                    </button>
                  )}
                </div>
              </section>

              {/* Visibility settings (representative only, category-sourced todos) */}
              {isRepresentative &&
                visibilityMembers.length > 0 &&
                todo.sourceCategory !== null && (
                  <TodoVisibilitySection
                    creatorId={creatorId}
                    todoId={todoId}
                    members={visibilityMembers}
                    onUpdate={setVisibilityMembers}
                    showToast={showToast}
                  />
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
                  {hasHiddenHistory && (
                    <button
                      type="button"
                      className="w-full min-h-11 rounded-full border border-border-light bg-bg-surface text-base text-text-secondary transition-colors active:bg-bg-surface-hover"
                      onClick={handleShowAllHistory}
                    >
                      {UI_MESSAGES.todo.showOlderHistory}（
                      {history.length - VISIBLE_HISTORY_COUNT}件）
                    </button>
                  )}
                  <div className="border-l-2 border-border-light pl-4 space-y-3">
                    {visibleHistory.map((entry) => (
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

      {/* Assignee picker (representative) */}
      <WheelPicker
        isOpen={isAssigneePickerOpen}
        options={assigneeOptions}
        selectedValue={todo?.assigneeId ?? ""}
        title={UI_MESSAGES.wheelPicker.assigneeTitle}
        onConfirm={handleAssigneeConfirm}
        onCancel={handleCloseAssigneePicker}
      />

      {/* Date picker (representative) */}
      <DatePicker
        isOpen={isDatePickerOpen}
        selectedDate={todo?.dueDate ?? ""}
        onConfirm={handleDateConfirm}
        onCancel={handleCloseDatePicker}
      />

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
