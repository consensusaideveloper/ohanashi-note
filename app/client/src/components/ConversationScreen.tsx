import { useState, useCallback, useRef, useEffect } from "react";

import { getCharacterById } from "../lib/characters";
import { getUserProfile } from "../lib/storage";
import { UI_MESSAGES } from "../lib/constants";
import {
  canStartSession,
  incrementDailySession,
  getRemainingSessionCount,
} from "../lib/usage-tracker";
import { getSessionQuota } from "../lib/api";
import { useConversation } from "../hooks/useConversation";

import type { SessionQuota } from "../lib/api";
import { StatusIndicator } from "./StatusIndicator";
import { AiOrb } from "./AiOrb";
import { ErrorDisplay } from "./ErrorDisplay";

import type { ReactNode } from "react";
import type { CharacterId, QuestionCategory } from "../types/conversation";

/** Format remaining milliseconds as "mm:ss". */
function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const STATE_GRADIENTS: Record<string, string> = {
  idle: "from-bg-primary to-bg-surface",
  connecting: "from-bg-primary to-bg-surface",
  listening: "from-active-glow/10 to-bg-primary",
  "ai-speaking": "from-accent-primary/10 to-bg-primary",
  error: "from-error/10 to-bg-primary",
};

interface ConversationScreenProps {
  /** When set, starts in focused mode for this category (from EndingNote). */
  initialCategory?: QuestionCategory;
  /** Called after the initialCategory has been consumed. */
  onCategoryConsumed?: () => void;
  /** Called when summarization status changes so parent can guard navigation. */
  onSummarizingChange?: (isSummarizing: boolean) => void;
}

export function ConversationScreen({
  initialCategory,
  onCategoryConsumed,
  onSummarizingChange,
}: ConversationScreenProps): ReactNode {
  const {
    state,
    errorType,
    transcript,
    pendingAssistantText,
    audioLevel,
    summaryStatus,
    remainingMs,
    sessionWarningShown,
    start,
    stop,
    retry,
  } = useConversation();

  const [isStarting, setIsStarting] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [serverQuota, setServerQuota] = useState<SessionQuota | null>(null);

  // Track active character during conversation
  const activeCharacterRef = useRef<CharacterId | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, pendingAssistantText]);

  // Notify parent when summarization status changes
  useEffect(() => {
    onSummarizingChange?.(summaryStatus === "pending");
  }, [summaryStatus, onSummarizingChange]);

  // Warn before closing browser tab during active conversation or summarization
  useEffect(() => {
    const shouldGuard =
      summaryStatus === "pending" || (state !== "idle" && state !== "error");
    if (!shouldGuard) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [state, summaryStatus]);

  // Fetch server-sourced session quota on mount and after each session ends
  useEffect(() => {
    if (state === "idle" && summaryStatus !== "pending") {
      getSessionQuota()
        .then((quota) => {
          setServerQuota(quota);
          if (!quota.canStart) {
            setDailyLimitReached(true);
          }
        })
        .catch(() => {
          // Fall back to localStorage if server is unavailable
          setServerQuota(null);
        });
    }
  }, [state, summaryStatus]);

  const handleQuickStart = useCallback((): void => {
    // Check server quota first, fall back to localStorage
    const canStart =
      serverQuota !== null ? serverQuota.canStart : canStartSession();
    if (!canStart) {
      setDailyLimitReached(true);
      return;
    }

    setIsStarting(true);
    setDailyLimitReached(false);
    const category = initialCategory ?? null; // null = guided mode
    if (initialCategory !== undefined && onCategoryConsumed !== undefined) {
      onCategoryConsumed();
    }
    // Keep localStorage sync for immediate UX feedback
    incrementDailySession();
    getUserProfile()
      .then((profile) => {
        const characterId: CharacterId = profile?.characterId ?? "character-a";
        activeCharacterRef.current = characterId;
        start(characterId, category);
      })
      .catch(() => {
        activeCharacterRef.current = "character-a";
        start("character-a", category);
      })
      .finally(() => {
        setIsStarting(false);
      });
  }, [start, initialCategory, onCategoryConsumed, serverQuota]);

  // Auto-start conversation when navigating from "このテーマで話す"
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (
      initialCategory !== undefined &&
      state === "idle" &&
      summaryStatus !== "pending" &&
      !hasAutoStarted.current
    ) {
      hasAutoStarted.current = true;
      handleQuickStart();
    }
  }, [initialCategory, state, summaryStatus, handleQuickStart]);

  const handleStop = useCallback((): void => {
    stop();
    activeCharacterRef.current = null;
  }, [stop]);

  const handleButtonClick = useCallback((): void => {
    switch (state) {
      case "listening":
      case "ai-speaking":
        handleStop();
        break;
      case "error":
        retry();
        break;
      default:
        break;
    }
  }, [state, handleStop, retry]);

  // Summary pending screen — shown after conversation ends while summary is being generated
  if (state === "idle" && summaryStatus === "pending") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
        <div className="w-16 h-16 mb-6 rounded-full bg-accent-primary/10 flex items-center justify-center animate-pulse">
          <svg
            className="w-8 h-8 text-accent-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
        <p className="text-xl text-text-primary font-medium mb-2">
          お話をまとめています...
        </p>
        <p className="text-lg text-text-secondary text-center">
          少々お待ちください
        </p>
      </div>
    );
  }

  // Summary failed screen — shown when summarization failed but transcript was saved
  if (state === "idle" && summaryStatus === "failed") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
        <div className="w-16 h-16 mb-6 rounded-full bg-error-light flex items-center justify-center">
          <svg
            className="w-8 h-8 text-error"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <p className="text-xl text-text-primary font-medium mb-2">
          {UI_MESSAGES.error.summaryFailed}
        </p>
        <button
          type="button"
          className="mt-8 min-h-14 min-w-48 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 font-bold shadow-lg"
          onClick={handleQuickStart}
        >
          新しくお話しする
        </button>
      </div>
    );
  }

  // Idle screen — quick start button or auto-start preparing state
  if (state === "idle") {
    // Show preparing screen when auto-starting from note or manually starting
    if (initialCategory !== undefined || isStarting) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
          <p className="text-2xl text-text-primary font-medium mb-10">
            準備しています...
          </p>
        </div>
      );
    }
    const remaining =
      serverQuota !== null ? serverQuota.remaining : getRemainingSessionCount();
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
        <p className="text-2xl text-text-primary font-medium mb-10">
          今日もお話ししましょう
        </p>
        {dailyLimitReached ? (
          <div className="text-center">
            <p className="text-xl text-text-primary mb-6">
              {UI_MESSAGES.dailyLimitReached}
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="min-h-[140px] min-w-[140px] rounded-full bg-accent-primary text-text-on-accent text-2xl font-medium shadow-lg active:scale-95 transition-transform flex items-center justify-center"
              onClick={handleQuickStart}
            >
              お話しする
            </button>
            <p className="mt-6 text-lg text-text-secondary">
              本日あと{remaining}回お話しできます
            </p>
          </>
        )}
      </div>
    );
  }

  // Conversation UI
  const characterName =
    activeCharacterRef.current !== null
      ? getCharacterById(activeCharacterRef.current).name
      : "アシスタント";
  const gradient = STATE_GRADIENTS[state] ?? STATE_GRADIENTS["idle"];

  return (
    <div
      className={`min-h-dvh flex flex-col items-center bg-gradient-to-b ${gradient}`}
    >
      {/* Top bar with end-conversation button and remaining time */}
      <div className="flex-none w-full max-w-lg flex items-center justify-between px-4 pt-4">
        <button
          type="button"
          className="min-w-11 min-h-11 flex items-center gap-1.5 rounded-full px-3 hover:bg-bg-surface/60 active:bg-bg-surface transition-colors"
          onClick={handleStop}
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
        {remainingMs !== null && (
          <span
            className={`text-lg tabular-nums ${
              sessionWarningShown
                ? "text-error font-semibold"
                : "text-text-secondary"
            }`}
            aria-live="polite"
          >
            残り {formatRemainingTime(remainingMs)}
          </span>
        )}
      </div>

      {/* Session time warning banner */}
      {sessionWarningShown && (
        <div className="flex-none w-full max-w-lg px-4 pt-2">
          <div className="rounded-card bg-warning/10 border border-warning/30 px-4 py-3 text-lg text-text-primary">
            {UI_MESSAGES.sessionWarning}
          </div>
        </div>
      )}

      {/* Status area */}
      <div className="flex-none pt-4 pb-6">
        {state === "error" && errorType !== null ? (
          <ErrorDisplay errorType={errorType} onRetry={retry} />
        ) : (
          <StatusIndicator state={state} characterName={characterName} />
        )}
      </div>

      {/* Orb area */}
      <div className="flex-none flex items-center justify-center py-8">
        <AiOrb
          state={state}
          audioLevel={audioLevel}
          onMicToggle={handleButtonClick}
          characterName={characterName}
        />
      </div>

      {/* Transcript area — notebook ruled lines */}
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
        {/* Show pending assistant text as it streams in */}
        {pendingAssistantText && (
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
