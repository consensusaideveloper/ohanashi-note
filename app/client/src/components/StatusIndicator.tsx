import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { ConversationState } from "../types/conversation";

interface StatusIndicatorProps {
  state: ConversationState;
  characterName: string;
}

export function StatusIndicator({
  state,
  characterName,
}: StatusIndicatorProps): ReactNode {
  const message = getStatusMessage(state, characterName);

  return (
    <div className="text-center px-4">
      <p className="text-xl md:text-2xl text-text-primary font-medium">
        {message}
      </p>
    </div>
  );
}

function getStatusMessage(
  state: ConversationState,
  characterName: string,
): string {
  switch (state) {
    case "idle":
      return `${characterName}とお話ししましょう`;
    case "connecting":
      return UI_MESSAGES.connecting;
    case "listening":
      return UI_MESSAGES.listening;
    case "ai-speaking":
      return `${characterName}がお答えしています`;
    case "error":
      return "";
  }
}
