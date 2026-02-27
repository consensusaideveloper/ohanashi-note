import { useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

interface ConversationBlockedScreenProps {
  lifecycleStatus: string;
  onNavigateToNote: () => void;
}

export function ConversationBlockedScreen({
  lifecycleStatus,
  onNavigateToNote,
}: ConversationBlockedScreenProps): ReactNode {
  let description: string = UI_MESSAGES.creatorLifecycle.conversationBlocked;
  if (lifecycleStatus === "death_reported") {
    description = UI_MESSAGES.creatorLifecycle.conversationBlockedDeathReported;
  } else if (lifecycleStatus === "opened") {
    description = UI_MESSAGES.creatorLifecycle.conversationBlockedOpened;
  }

  const handleViewNote = useCallback((): void => {
    onNavigateToNote();
  }, [onNavigateToNote]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="max-w-sm space-y-6 text-center">
        {/* Info icon */}
        <div className="flex justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <p className="text-xl text-text-primary font-medium whitespace-pre-line leading-relaxed">
          {description}
        </p>

        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-8 transition-colors active:bg-accent-primary-hover"
          onClick={handleViewNote}
        >
          {UI_MESSAGES.creatorLifecycle.viewNoteInstead}
        </button>
      </div>
    </div>
  );
}
