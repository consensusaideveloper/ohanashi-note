import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { ErrorType } from "../types/conversation";

interface ErrorDisplayProps {
  errorType: ErrorType;
  onRetry: () => void;
}

export function ErrorDisplay({
  errorType,
  onRetry,
}: ErrorDisplayProps): ReactNode {
  const message = UI_MESSAGES.error[errorType];

  // Retry is not meaningful when the daily quota is exhausted
  const showRetry = errorType !== "quotaExceeded";

  return (
    <div className="text-center px-6">
      <p className="text-xl text-text-primary mb-8 leading-relaxed">
        {message}
      </p>
      {showRetry && (
        <button
          className="min-h-14 min-w-48 rounded-full bg-accent-primary active:bg-accent-primary-hover text-text-on-accent text-xl px-8 py-4 font-bold shadow-lg cursor-pointer"
          onClick={onRetry}
          type="button"
        >
          {UI_MESSAGES.buttons.retry}
        </button>
      )}
    </div>
  );
}
