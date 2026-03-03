import { useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

interface DailyChatCardProps {
  onSelect: () => void;
}

const CARD_TITLE = "今日のおしゃべり";
const CARD_SUBTITLE = UI_MESSAGES.wellness.dailyChatDescription;

export function DailyChatCard({ onSelect }: DailyChatCardProps): ReactNode {
  const handleClick = useCallback((): void => {
    onSelect();
  }, [onSelect]);

  return (
    <button
      type="button"
      className="w-full bg-accent-primary-light border border-accent-primary/30 rounded-card p-4 min-h-11 text-left transition-colors hover:bg-accent-primary-light/80 active:bg-accent-primary-light/60 flex items-center gap-4"
      onClick={handleClick}
    >
      {/* Chat bubble SVG icon */}
      <div className="flex-none">
        <svg
          className="w-9 h-9 text-accent-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xl font-medium text-text-primary">{CARD_TITLE}</p>
        <p className="text-lg text-text-secondary">{CARD_SUBTITLE}</p>
      </div>
      {/* Chevron right */}
      <div className="flex-none">
        <svg
          className="w-5 h-5 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 4.5l7.5 7.5-7.5 7.5"
          />
        </svg>
      </div>
    </button>
  );
}
