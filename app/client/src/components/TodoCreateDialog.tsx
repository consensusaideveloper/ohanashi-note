import { useState, useRef, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { TodoPriority } from "../lib/todo-api";

interface FamilyMemberOption {
  familyMemberId: string;
  name: string;
}

interface TodoCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    sourceCategory?: string;
    priority?: TodoPriority;
    assigneeId?: string;
    dueDate?: string;
  }) => void;
  isSubmitting: boolean;
  familyMembers: FamilyMemberOption[];
}

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

export function TodoCreateDialog({
  isOpen,
  onClose,
  onCreate,
  isSubmitting,
  familyMembers,
}: TodoCreateDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setAssigneeId("");
      setDueDate("");
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  const handleSubmit = useCallback((): void => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) return;

    const data: {
      title: string;
      description?: string;
      priority?: TodoPriority;
      assigneeId?: string;
      dueDate?: string;
    } = { title: trimmedTitle };

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 0) {
      data.description = trimmedDescription;
    }
    if (priority !== "medium") {
      data.priority = priority;
    }
    if (assigneeId.length > 0) {
      data.assigneeId = assigneeId;
    }
    if (dueDate.length > 0) {
      data.dueDate = dueDate;
    }

    onCreate(data);
  }, [title, description, priority, assigneeId, dueDate, onCreate]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setTitle(e.target.value);
    },
    [],
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      setDescription(e.target.value);
    },
    [],
  );

  const handleAssigneeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      setAssigneeId(e.target.value);
    },
    [],
  );

  const handleDueDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setDueDate(e.target.value);
    },
    [],
  );

  const handleClose = useCallback((): void => {
    onClose();
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-md w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-5">
        <h2 className="text-xl font-semibold text-text-primary">
          {UI_MESSAGES.todo.createDialogTitle}
        </h2>

        {/* Title */}
        <div className="space-y-1">
          <label
            htmlFor="todo-title"
            className="text-base font-medium text-text-primary"
          >
            {UI_MESSAGES.todo.titleLabel}
          </label>
          <input
            id="todo-title"
            type="text"
            className="w-full min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none"
            value={title}
            onChange={handleTitleChange}
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label
            htmlFor="todo-description"
            className="text-base font-medium text-text-primary"
          >
            {UI_MESSAGES.todo.descriptionLabel}
          </label>
          <textarea
            id="todo-description"
            className="w-full min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none resize-none"
            value={description}
            onChange={handleDescriptionChange}
            rows={3}
          />
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <span className="text-base font-medium text-text-primary">
            {UI_MESSAGES.todo.priorityLabel}
          </span>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((option) => {
              const isActive = priority === option.value;
              const handleSelectPriority = (): void => {
                setPriority(option.value);
              };
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`min-h-11 flex-1 rounded-full border text-lg transition-colors ${
                    isActive
                      ? PRIORITY_ACTIVE_STYLES[option.value]
                      : "border-border-light text-text-secondary bg-bg-surface active:bg-bg-surface-hover"
                  }`}
                  onClick={handleSelectPriority}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Assignee */}
        <div className="space-y-1">
          <label
            htmlFor="todo-assignee"
            className="text-base font-medium text-text-primary"
          >
            {UI_MESSAGES.todo.assigneeLabel}
          </label>
          <select
            id="todo-assignee"
            className="w-full min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none"
            value={assigneeId}
            onChange={handleAssigneeChange}
          >
            <option value="">{UI_MESSAGES.todo.noAssignee}</option>
            {familyMembers.map((member) => (
              <option key={member.familyMemberId} value={member.familyMemberId}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        {/* Due date */}
        <div className="space-y-1">
          <label
            htmlFor="todo-due-date"
            className="text-base font-medium text-text-primary"
          >
            {UI_MESSAGES.todo.dueDateLabel}
          </label>
          <input
            id="todo-due-date"
            type="date"
            className="w-full min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none"
            value={dueDate}
            onChange={handleDueDateChange}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
            onClick={handleClose}
          >
            やめる
          </button>
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting || title.trim().length === 0}
          >
            {UI_MESSAGES.todo.createButton}
          </button>
        </div>
      </div>
    </dialog>
  );
}
