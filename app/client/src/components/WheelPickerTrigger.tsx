import { useCallback } from "react";

import type { ReactNode } from "react";

interface WheelPickerTriggerProps {
  id?: string;
  displayValue: string;
  placeholder?: string;
  onClick: () => void;
}

export function WheelPickerTrigger({
  id,
  displayValue,
  placeholder = "選択してください",
  onClick,
}: WheelPickerTriggerProps): ReactNode {
  const handleClick = useCallback((): void => {
    onClick();
  }, [onClick]);

  const hasValue = displayValue.length > 0;

  return (
    <button
      id={id}
      type="button"
      className="w-full min-h-11 rounded-card border border-border-light bg-bg-surface px-4 py-3 text-lg text-left flex items-center justify-between focus:outline-none focus:border-accent-primary transition-colors"
      onClick={handleClick}
    >
      <span className={hasValue ? "text-text-primary" : "text-text-secondary"}>
        {hasValue ? displayValue : placeholder}
      </span>
      <svg
        className="w-5 h-5 text-text-secondary flex-none ml-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
        />
      </svg>
    </button>
  );
}
