import { useRef, useEffect, useCallback } from "react";

import type { ReactNode } from "react";

interface PushPermissionPromptProps {
  isOpen: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

const TITLE = "お知らせ機能について";
const BODY =
  "大事なお知らせをお届けするために、通知の許可をお願いします。いつでも設定から変更できます。";
const ALLOW_LABEL = "通知を許可する";
const DISMISS_LABEL = "あとで";

export function PushPermissionPrompt({
  isOpen,
  onAllow,
  onDismiss,
}: PushPermissionPromptProps): ReactNode {
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
        onDismiss();
      }
    },
    [onDismiss],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onDismiss();
    },
    [onDismiss],
  );

  const handleAllow = useCallback((): void => {
    onAllow();
  }, [onAllow]);

  const handleDismiss = useCallback((): void => {
    onDismiss();
  }, [onDismiss]);

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-sm w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-text-primary mb-3">
          {TITLE}
        </h2>
        <p className="text-lg text-text-secondary leading-relaxed mb-6">
          {BODY}
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors hover:bg-accent-primary-hover"
            onClick={handleAllow}
          >
            {ALLOW_LABEL}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-secondary hover:bg-bg-surface-hover active:bg-border-light transition-colors"
            onClick={handleDismiss}
          >
            {DISMISS_LABEL}
          </button>
        </div>
      </div>
    </dialog>
  );
}
