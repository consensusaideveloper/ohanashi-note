import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { ConversationState } from "../types/conversation";

interface StatusIndicatorProps {
  state: ConversationState;
}

export function StatusIndicator({ state }: StatusIndicatorProps): ReactNode {
  const message = getStatusMessage(state);

  return (
    <div className="text-center px-4">
      <p className="text-xl md:text-2xl text-text-primary font-medium">
        {message}
      </p>
    </div>
  );
}

function getStatusMessage(state: ConversationState): string {
  switch (state) {
    case "idle":
      return "お話ししましょう";
    case "connecting":
      return UI_MESSAGES.connecting;
    case "listening":
      return UI_MESSAGES.listening;
    case "ai-speaking":
      return "お答えしています";
    case "error":
      return "";
  }
}
