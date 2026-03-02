import { useState, useCallback, useRef, useEffect } from "react";

import { getUserProfile } from "../lib/storage";
import { UI_MESSAGES } from "../lib/constants";
import { getSessionQuota } from "../lib/api";
import { useOrientation } from "../hooks/useOrientation";
import { StatusIndicator } from "./StatusIndicator";
import { AiFace } from "./AiFace";
import { ErrorDisplay } from "./ErrorDisplay";

import type { ReactNode } from "react";
import type { UseConversationReturn } from "../hooks/useConversation";
import type { SessionQuota } from "../lib/api";
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

/** Per-character background gradient for ai-speaking state. */
const CHARACTER_SPEAKING_GRADIENTS: Record<CharacterId, string> = {
  "character-a": "from-accent-secondary/10 to-bg-primary",
  "character-b": "from-accent-tertiary/10 to-bg-primary",
  "character-c": "from-accent-primary/10 to-bg-primary",
};

interface ConversationScreenProps {
  /** When set, starts in focused mode for this category (from EndingNote). */
  initialCategory?: QuestionCategory;
  /** Called after the initialCategory has been consumed. */
  onCategoryConsumed?: () => void;
  /** Called when summarization status changes so parent can guard navigation. */
  onSummarizingChange?: (isSummarizing: boolean) => void;
  /** Called when AI-triggered auto-end completes. */
  onAutoEnded?: () => void;
  /** Conversation hook values lifted from AppContent. */
  conversation: UseConversationReturn;
}

export function ConversationScreen({
  initialCategory,
  onCategoryConsumed,
  onSummarizingChange,
  onAutoEnded,
  conversation,
}: ConversationScreenProps): ReactNode {
  const {
    state,
    errorType,
    transcript,
    pendingAssistantText,
    audioLevel,
    characterId,
    summaryStatus,
    remainingMs,
    sessionWarningShown,
    autoEndSignal,
    start,
    stop,
    retry,
  } = conversation;

  const orientation = useOrientation();
  const isLandscape = orientation === "landscape";

  const [isStarting, setIsStarting] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [serverQuota, setServerQuota] = useState<SessionQuota | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const lastAutoEndSignalRef = useRef(autoEndSignal);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, pendingAssistantText]);

  // Notify parent when summarization status changes
  useEffect(() => {
    onSummarizingChange?.(summaryStatus === "pending");
  }, [summaryStatus, onSummarizingChange]);

  useEffect(() => {
    if (autoEndSignal !== lastAutoEndSignalRef.current) {
      lastAutoEndSignalRef.current = autoEndSignal;
      onAutoEnded?.();
    }
  }, [autoEndSignal, onAutoEnded]);

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
          setDailyLimitReached(!quota.canStart);
        })
        .catch(() => {
          // Fail-open: do not block user start when quota fetch fails.
          setServerQuota(null);
          setDailyLimitReached(false);
        });
    }
  }, [state, summaryStatus]);

  const handleQuickStart = useCallback((): void => {
    setIsStarting(true);
    setDailyLimitReached(false);
    getSessionQuota()
      .then((quota) => {
        setServerQuota(quota);
        setDailyLimitReached(!quota.canStart);
        if (!quota.canStart) {
          // Clear pending focused category so the UI does not remain in
          // "準備しています..." state when start is blocked.
          onCategoryConsumed?.();
          return;
        }

        const category = initialCategory ?? null; // null = guided mode
        if (initialCategory !== undefined && onCategoryConsumed !== undefined) {
          onCategoryConsumed();
        }

        getUserProfile()
          .then((profile) => {
            const characterId: CharacterId =
              profile?.characterId ?? "character-a";
            start(characterId, category);
          })
          .catch(() => {
            start("character-a", category);
          });
      })
      .catch(() => {
        // Fail-open when quota fetch fails.
        const category = initialCategory ?? null; // null = guided mode
        if (initialCategory !== undefined && onCategoryConsumed !== undefined) {
          onCategoryConsumed();
        }
        getUserProfile()
          .then((profile) => {
            const characterId: CharacterId =
              profile?.characterId ?? "character-a";
            start(characterId, category);
          })
          .catch(() => {
            start("character-a", category);
          });
      })
      .finally(() => {
        setIsStarting(false);
      });
  }, [start, initialCategory, onCategoryConsumed]);

  // Auto-start conversation when navigating from "このテーマで話す"
  const hasAutoStarted = useRef(false);
  const previousInitialCategoryRef = useRef<QuestionCategory | undefined>(
    initialCategory,
  );

  // Reset auto-start guard when initialCategory changes.
  useEffect(() => {
    if (previousInitialCategoryRef.current !== initialCategory) {
      hasAutoStarted.current = false;
      previousInitialCategoryRef.current = initialCategory;
    }
  }, [initialCategory]);

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
    const remaining = serverQuota?.remaining;
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
            {remaining !== undefined && (
              <p className="mt-6 text-lg text-text-secondary">
                本日あと{remaining}回お話しできます
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // Conversation UI — use per-character gradient for ai-speaking state
  const gradient =
    state === "ai-speaking" && characterId !== null
      ? CHARACTER_SPEAKING_GRADIENTS[characterId]
      : (STATE_GRADIENTS[state] ?? STATE_GRADIENTS["idle"]);

  return (
    <div
      className={`h-dvh flex flex-col overflow-hidden bg-gradient-to-b ${gradient} ${isLandscape ? "" : "items-center"}`}
    >
      {/* Top bar with end-conversation button and remaining time */}
      <div
        className={`flex-none w-full flex items-center justify-between px-4 pt-4 ${isLandscape ? "" : "max-w-lg"}`}
      >
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
        <div
          className={`flex-none w-full px-4 pt-2 ${isLandscape ? "" : "max-w-lg"}`}
        >
          <div className="rounded-card bg-warning/10 border border-warning/30 px-4 py-3 text-lg text-text-primary">
            {UI_MESSAGES.sessionWarning}
          </div>
        </div>
      )}

      {/* Content area: portrait = column, landscape = side-by-side grid */}
      <div
        className={
          isLandscape
            ? "flex-1 grid grid-cols-2 gap-2 w-full overflow-hidden min-h-0"
            : "flex-1 flex flex-col items-center w-full min-h-0"
        }
      >
        {/* Face section (always visible — flex-none keeps it pinned) */}
        <div
          className={
            isLandscape
              ? "flex flex-col items-center justify-center gap-2"
              : "flex-none flex flex-col items-center"
          }
        >
          {/* Status area */}
          <div className={isLandscape ? "pb-2" : "pt-4 pb-6"}>
            {state === "error" && errorType !== null ? (
              <ErrorDisplay errorType={errorType} onRetry={retry} />
            ) : (
              <StatusIndicator state={state} />
            )}
          </div>

          {/* Face area */}
          <div
            className={
              isLandscape
                ? "flex items-center justify-center"
                : "flex items-center justify-center py-8"
            }
          >
            <AiFace
              state={state}
              audioLevel={audioLevel}
              onMicToggle={handleButtonClick}
              large={isLandscape}
              characterId={characterId}
            />
          </div>
        </div>

        {/* Transcript (scrollable — only this area scrolls) */}
        <div
          className={`overflow-y-auto overscroll-contain px-4 pb-8 notebook-lines ${isLandscape ? "" : "flex-1 w-full max-w-lg min-h-0"}`}
        >
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
    </div>
  );
}
