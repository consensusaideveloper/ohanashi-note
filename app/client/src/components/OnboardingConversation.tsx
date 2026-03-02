import { useCallback, useEffect, useRef } from "react";

import { ONBOARDING_CONVERSATION_MESSAGES } from "../lib/constants";
import { useFontSize } from "../contexts/FontSizeContext";
import { useOnboardingConversation } from "../hooks/useOnboardingConversation";
import { StatusIndicator } from "./StatusIndicator";
import { AiOrb } from "./AiOrb";
import { ErrorDisplay } from "./ErrorDisplay";

import type { ReactNode } from "react";

interface OnboardingConversationProps {
  onComplete: () => void;
}

const STATE_GRADIENTS: Record<string, string> = {
  idle: "from-bg-primary to-bg-surface",
  connecting: "from-bg-primary to-bg-surface",
  listening: "from-active-glow/10 to-bg-primary",
  "ai-speaking": "from-accent-primary/10 to-bg-primary",
  error: "from-error/10 to-bg-primary",
};

export function OnboardingConversation({
  onComplete,
}: OnboardingConversationProps): ReactNode {
  const { setFontSize } = useFontSize();

  const {
    state,
    errorType,
    transcript,
    pendingAssistantText,
    audioLevel,
    start,
    stop,
    retry,
  } = useOnboardingConversation({ setFontSize, onComplete });

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, pendingAssistantText]);

  const handleOrbClick = useCallback((): void => {
    if (state === "error") {
      retry();
    }
  }, [state, retry]);

  // Idle state — show start button
  if (state === "idle") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
        <div className="w-full max-w-lg text-center space-y-6">
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
            {ONBOARDING_CONVERSATION_MESSAGES.title}
          </h1>
          <p className="text-xl text-text-secondary">
            {ONBOARDING_CONVERSATION_MESSAGES.subtitle}
          </p>
          <button
            type="button"
            className="min-h-[140px] min-w-[140px] rounded-full bg-accent-primary text-text-on-accent text-2xl font-medium shadow-lg active:scale-95 transition-transform flex items-center justify-center mx-auto"
            onClick={start}
          >
            {ONBOARDING_CONVERSATION_MESSAGES.startButton}
          </button>
        </div>
      </div>
    );
  }

  // Active conversation UI
  const gradient = STATE_GRADIENTS[state] ?? STATE_GRADIENTS["idle"];

  return (
    <div
      className={`min-h-dvh flex flex-col items-center bg-gradient-to-b ${gradient}`}
    >
      {/* Top bar with end-conversation button */}
      <div className="flex-none w-full max-w-lg px-4 pt-4">
        <button
          type="button"
          className="min-w-11 min-h-11 flex items-center gap-1.5 rounded-full px-3 hover:bg-bg-surface/60 active:bg-bg-surface transition-colors"
          onClick={stop}
          aria-label="お話しを終える"
        >
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          <span className="text-lg text-text-secondary">終える</span>
        </button>
      </div>

      {/* Status area */}
      <div className="flex-none pt-4 pb-6">
        {state === "error" && errorType !== null ? (
          <ErrorDisplay errorType={errorType} onRetry={retry} />
        ) : (
          <StatusIndicator state={state} />
        )}
      </div>

      {/* Orb area */}
      <div className="flex-none flex items-center justify-center py-8">
        <AiOrb
          state={state}
          audioLevel={audioLevel}
          onMicToggle={handleOrbClick}
          characterName="話し相手"
        />
      </div>

      {/* Transcript area */}
      <div className="flex-1 w-full max-w-lg overflow-y-auto px-4 pb-8 notebook-lines">
        {transcript.map((entry, index) => (
          <div
            key={`${entry.timestamp}-${index}`}
            className={`mb-3 flex animate-fade-in ${
              entry.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-card px-4 py-3 text-lg ${
                entry.role === "user"
                  ? "bg-accent-primary-light text-text-primary"
                  : "bg-bg-surface text-text-primary shadow-sm"
              }`}
            >
              {entry.text}
            </div>
          </div>
        ))}
        {pendingAssistantText !== "" && (
          <div className="mb-3 flex justify-start animate-fade-in">
            <div className="max-w-[80%] rounded-card px-4 py-3 text-lg bg-bg-surface text-text-secondary shadow-sm">
              {pendingAssistantText}
            </div>
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>
    </div>
  );
}
