import { useRef, useEffect, useCallback } from "react";

import type { ReactNode } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "はい",
  cancelLabel = "いいえ",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  const handleConfirm = useCallback((): void => {
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback((): void => {
    onCancel();
  }, [onCancel]);

  const confirmButtonClasses =
    variant === "danger"
      ? "bg-error text-text-on-accent"
      : "bg-accent-primary text-text-on-accent";

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-sm w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-text-primary mb-3">
          {title}
        </h2>
        <p className="text-lg text-text-secondary leading-relaxed mb-6">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary hover:bg-bg-surface-hover active:bg-border-light transition-colors"
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`flex-1 min-h-11 rounded-full text-lg transition-colors ${confirmButtonClasses}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
