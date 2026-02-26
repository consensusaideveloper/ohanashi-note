import { useEffect } from "react";

import { TOAST_DISPLAY_DURATION_MS } from "../lib/constants";

import type { ReactNode } from "react";

interface ToastProps {
  message: string;
  variant: "success" | "error";
  isVisible: boolean;
  onDismiss: () => void;
}

export function Toast({
  message,
  variant,
  isVisible,
  onDismiss,
}: ToastProps): ReactNode {
  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const timer = setTimeout(onDismiss, TOAST_DISPLAY_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isVisible, onDismiss]);

  if (!isVisible) {
    return null;
  }

  const variantClasses =
    variant === "success"
      ? "bg-success-light text-success border-success/30"
      : "bg-error-light text-error border-error/30";

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 flex justify-center animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <div
        className={`max-w-sm w-full rounded-card border px-4 py-3 shadow-lg flex items-center justify-between gap-3 ${variantClasses}`}
      >
        <p className="text-lg flex-1">{message}</p>
        <button
          type="button"
          className="min-h-11 min-w-11 flex items-center justify-center flex-none"
          onClick={onDismiss}
          aria-label="閉じる"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
