import { useEffect, useRef } from "react";

import type { ReactNode } from "react";
import type { CharacterId, ConversationState } from "../types/conversation";

/** Spring physics constants for natural mouth movement. */
const SPRING_STIFFNESS = 0.15;
const SPRING_DAMPING = 0.75;
const AUDIO_SMOOTHING = 0.3;

/** SVG face layout constants (viewBox 0 0 100 100). */
const EYE_LEFT_CX = 38;
const EYE_RIGHT_CX = 62;
const EYE_CY = 42;
const EYE_RX = 6;
const EYE_RY_NORMAL = 7;
const EYE_RY_ERROR = 8;

const MOUTH_X_START = 35;
const MOUTH_X_END = 65;
const MOUTH_Y_BASE = 65;
const MOUTH_CONTROL_X = 50;
const MOUTH_SMILE_CY = 70;
const MOUTH_OPEN_CY = 80;
const MOUTH_FROWN_CY = 60;

interface SpringState {
  current: number;
  velocity: number;
  smoothedLevel: number;
}

interface AiFaceProps {
  state: ConversationState;
  audioLevel: number;
  onMicToggle: () => void;
  /** Render the face at a larger size (for landscape mode). */
  large?: boolean;
  /** Active character ID for per-character color theming. */
  characterId?: CharacterId | null;
}

function buildMouthPath(controlY: number): string {
  return `M ${MOUTH_X_START} ${MOUTH_Y_BASE} Q ${MOUTH_CONTROL_X} ${controlY}, ${MOUTH_X_END} ${MOUTH_Y_BASE}`;
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

/** Per-character glow background for idle state. */
const CHARACTER_GLOW_IDLE: Record<CharacterId, string> = {
  "character-a": "bg-accent-secondary/20",
  "character-b": "bg-accent-tertiary/20",
  "character-c": "bg-accent-primary/20",
};

/** Per-character glow background for ai-speaking state. */
const CHARACTER_GLOW_SPEAKING: Record<CharacterId, string> = {
  "character-a": "bg-accent-secondary/20",
  "character-b": "bg-accent-tertiary/20",
  "character-c": "bg-accent-primary/20",
};

/** Per-character ripple border for listening state. */
const CHARACTER_RIPPLE_BORDER: Record<CharacterId, string> = {
  "character-a": "border-accent-secondary",
  "character-b": "border-accent-tertiary",
  "character-c": "border-active-glow",
};

const DEFAULT_CHARACTER_ID: CharacterId = "character-a";

function getGlowClasses(
  state: ConversationState,
  characterId: CharacterId | null | undefined,
): string {
  const charId = characterId ?? DEFAULT_CHARACTER_ID;
  switch (state) {
    case "idle":
      return `${CHARACTER_GLOW_IDLE[charId]} animate-breathe`;
    case "connecting":
      return "bg-text-secondary/10";
    case "listening":
      return "bg-active-glow/30";
    case "ai-speaking":
      return `${CHARACTER_GLOW_SPEAKING[charId]} animate-flow`;
    case "error":
      return "bg-error/10";
  }
}

function getFaceGradient(state: ConversationState): string {
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

function getFaceExtraClasses(state: ConversationState): string {
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

function getMicLabel(state: ConversationState): string | null {
  switch (state) {
    case "listening":
      return "お話し中";
    case "ai-speaking":
      return "お答え中";
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

export function AiFace({
  state,
  audioLevel,
  onMicToggle,
  large = false,
  characterId,
}: AiFaceProps): ReactNode {
  const mouthRef = useRef<SVGPathElement>(null);
  const animationRef = useRef<number>(0);
  const springRef = useRef<SpringState>({
    current: MOUTH_SMILE_CY,
    velocity: 0,
    smoothedLevel: 0,
  });
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;

  // Animate mouth during ai-speaking; set static position for other states
  useEffect(() => {
    if (state !== "ai-speaking") {
      cancelAnimationFrame(animationRef.current);
      const targetY = state === "error" ? MOUTH_FROWN_CY : MOUTH_SMILE_CY;
      if (mouthRef.current !== null) {
        mouthRef.current.setAttribute("d", buildMouthPath(targetY));
      }
      springRef.current = { current: targetY, velocity: 0, smoothedLevel: 0 };
      return;
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const animate = (): void => {
      const spring = springRef.current;
      const level = audioLevelRef.current;

      spring.smoothedLevel += (level - spring.smoothedLevel) * AUDIO_SMOOTHING;

      const target =
        MOUTH_SMILE_CY +
        spring.smoothedLevel * (MOUTH_OPEN_CY - MOUTH_SMILE_CY);

      if (prefersReduced) {
        spring.current = target;
      } else {
        const force = (target - spring.current) * SPRING_STIFFNESS;
        spring.velocity = (spring.velocity + force) * SPRING_DAMPING;
        spring.current += spring.velocity;
      }

      if (mouthRef.current !== null) {
        mouthRef.current.setAttribute("d", buildMouthPath(spring.current));
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [state]);

  const glowClasses = getGlowClasses(state, characterId);
  const faceGradient = getFaceGradient(state);
  const faceExtraClasses = getFaceExtraClasses(state);
  const showMic = shouldShowMicButton(state);
  const micClasses = getMicButtonClasses(state);
  const micLabel = getMicLabel(state);
  const isDisabled = state === "connecting";

  const glowStyle: React.CSSProperties =
    state === "listening"
      ? { transform: `scale(${1 + audioLevel * 0.3})` }
      : {};

  const eyeRy = state === "error" ? EYE_RY_ERROR : EYE_RY_NORMAL;
  const showBlink = state !== "connecting";
  const eyeStyle: React.CSSProperties = {
    transformBox: "fill-box",
    transformOrigin: "center",
    ...(state === "connecting" ? { transform: "scaleY(0.4)" } : {}),
  };

  const containerSize = large ? "w-[240px] h-[240px]" : "w-[160px] h-[160px]";
  const coreSize = large ? "w-[180px] h-[180px]" : "w-[120px] h-[120px]";
  const glowInset = large ? "inset-[-30px]" : "inset-[-20px]";
  const rippleInset = large ? "inset-[30px]" : "inset-[20px]";

  return (
    <div
      className="relative flex flex-col items-center gap-4"
      data-character={characterId ?? undefined}
    >
      {/* Face container */}
      <div
        className={`relative ${containerSize} flex items-center justify-center`}
      >
        {/* Glow layer */}
        <div
          className={`absolute ${glowInset} rounded-full transition-all duration-300 ${glowClasses}`}
          style={glowStyle}
        />

        {/* Ripple rings (listening only) */}
        {state === "listening" && (
          <>
            <div
              className={`absolute ${rippleInset} rounded-full border-2 ${CHARACTER_RIPPLE_BORDER[characterId ?? DEFAULT_CHARACTER_ID]} animate-ripple`}
              style={{ animationDelay: "0s" }}
            />
            <div
              className={`absolute ${rippleInset} rounded-full border-2 ${CHARACTER_RIPPLE_BORDER[characterId ?? DEFAULT_CHARACTER_ID]} animate-ripple`}
              style={{ animationDelay: "0.6s" }}
            />
          </>
        )}

        {/* Face core */}
        <div
          className={`${coreSize} rounded-full relative z-10 shadow-lg transition-all duration-300 overflow-hidden ${faceExtraClasses}`}
          style={{ background: faceGradient }}
        >
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            role="img"
            aria-label="話し相手の顔"
          >
            {/* Left eye */}
            <ellipse
              cx={EYE_LEFT_CX}
              cy={EYE_CY}
              rx={EYE_RX}
              ry={eyeRy}
              fill="white"
              className={showBlink ? "animate-blink" : ""}
              style={eyeStyle}
            />
            {/* Right eye */}
            <ellipse
              cx={EYE_RIGHT_CX}
              cy={EYE_CY}
              rx={EYE_RX}
              ry={eyeRy}
              fill="white"
              className={showBlink ? "animate-blink" : ""}
              style={eyeStyle}
            />
            {/* Mouth */}
            <path
              ref={mouthRef}
              d={buildMouthPath(MOUTH_SMILE_CY)}
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
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
