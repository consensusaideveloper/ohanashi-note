import type { ReactNode } from "react";
import type { ConversationState } from "../types/conversation";

interface AiOrbProps {
  state: ConversationState;
  audioLevel: number;
  onMicToggle: () => void;
  characterName: string;
}

function MicrophoneIcon(): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SpeakerIcon(): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function LoadingSpinner(): ReactNode {
  return (
    <svg
      className="animate-spin"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.4 31.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getGlowClasses(state: ConversationState): string {
  switch (state) {
    case "idle":
      return "bg-accent-secondary/20 animate-breathe";
    case "connecting":
      return "bg-text-secondary/10";
    case "listening":
      return "bg-active-glow/30";
    case "ai-speaking":
      return "bg-accent-primary/20 animate-flow";
    case "error":
      return "bg-error/10";
  }
}

function getOrbGradient(state: ConversationState): string {
  switch (state) {
    case "idle":
      return "radial-gradient(circle at 35% 35%, var(--color-orb-idle-from), var(--color-orb-idle-to))";
    case "connecting":
      return "radial-gradient(circle at 35% 35%, var(--color-orb-connecting-from), var(--color-orb-connecting-to))";
    case "listening":
      return "radial-gradient(circle at 35% 35%, var(--color-orb-listening-from), var(--color-orb-listening-to))";
    case "ai-speaking":
      return "radial-gradient(circle at 35% 35%, var(--color-orb-speaking-from), var(--color-orb-speaking-to))";
    case "error":
      return "radial-gradient(circle at 35% 35%, var(--color-orb-error-from), var(--color-orb-error-to))";
  }
}

function getOrbExtraClasses(state: ConversationState): string {
  switch (state) {
    case "connecting":
      return "opacity-70";
    case "ai-speaking":
      return "animate-flow";
    default:
      return "";
  }
}

function shouldShowMicButton(state: ConversationState): boolean {
  return state !== "idle" && state !== "error";
}

function getMicButtonClasses(state: ConversationState): string {
  switch (state) {
    case "listening":
      return "bg-accent-primary text-text-on-accent active:bg-accent-primary-hover";
    case "ai-speaking":
      return "bg-bg-surface text-text-secondary border border-border";
    case "connecting":
      return "bg-bg-surface text-text-secondary border border-border opacity-70 cursor-not-allowed";
    default:
      return "";
  }
}

function getMicLabel(
  state: ConversationState,
  characterName: string,
): string | null {
  switch (state) {
    case "listening":
      return "お話し中";
    case "ai-speaking":
      return `${characterName}が話しています`;
    default:
      return null;
  }
}

function getMicAriaLabel(state: ConversationState): string {
  switch (state) {
    case "listening":
      return "マイクをオフにする";
    case "ai-speaking":
      return "話し中";
    case "connecting":
      return "接続中";
    default:
      return "マイク";
  }
}

function MicButtonContent({ state }: { state: ConversationState }): ReactNode {
  switch (state) {
    case "connecting":
      return <LoadingSpinner />;
    case "listening":
      return <MicrophoneIcon />;
    case "ai-speaking":
      return <SpeakerIcon />;
    default:
      return null;
  }
}

export function AiOrb({
  state,
  audioLevel,
  onMicToggle,
  characterName,
}: AiOrbProps): ReactNode {
  const glowClasses = getGlowClasses(state);
  const orbGradient = getOrbGradient(state);
  const orbExtraClasses = getOrbExtraClasses(state);
  const showMic = shouldShowMicButton(state);
  const micClasses = getMicButtonClasses(state);
  const micLabel = getMicLabel(state, characterName);
  const isDisabled = state === "connecting";

  const glowStyle: React.CSSProperties =
    state === "listening"
      ? { transform: `scale(${1 + audioLevel * 0.3})` }
      : {};

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Orb container */}
      <div className="relative w-[160px] h-[160px] flex items-center justify-center">
        {/* Glow layer */}
        <div
          className={`absolute inset-[-20px] rounded-full transition-all duration-300 ${glowClasses}`}
          style={glowStyle}
        />

        {/* Ripple rings (listening only) */}
        {state === "listening" && (
          <>
            <div
              className="absolute inset-[20px] rounded-full border-2 border-active-glow animate-ripple"
              style={{ animationDelay: "0s" }}
            />
            <div
              className="absolute inset-[20px] rounded-full border-2 border-active-glow animate-ripple"
              style={{ animationDelay: "0.6s" }}
            />
          </>
        )}

        {/* Orb core */}
        <div
          className={`w-[120px] h-[120px] rounded-full relative z-10 shadow-lg transition-all duration-300 ${orbExtraClasses}`}
          style={{ background: orbGradient }}
        />
      </div>

      {/* Mic button */}
      {showMic && (
        <div className="flex flex-col items-center">
          <button
            type="button"
            className={`w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-md transition-colors duration-300 cursor-pointer ${micClasses}`}
            onClick={onMicToggle}
            disabled={isDisabled}
            aria-label={getMicAriaLabel(state)}
          >
            <MicButtonContent state={state} />
          </button>
          {micLabel !== null && (
            <span className="text-lg text-text-secondary mt-1">{micLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
