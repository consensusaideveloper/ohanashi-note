import { useEffect, useRef } from "react";

import type { ReactNode } from "react";
import type { CharacterId, ConversationState } from "../types/conversation";

/** Spring physics constants for natural mouth movement. */
const SPRING_STIFFNESS = 0.15;
const SPRING_DAMPING = 0.75;
const AUDIO_SMOOTHING = 0.3;
const REMOTE_AUDIO_GATE = 0.006;
const REMOTE_AUDIO_NORMALIZE_RANGE = 0.04;
const MOUTH_ACTIVE_HOLD_MS = 220;
const MOUTH_REST_OPENNESS = 0.04;
const MOUTH_SPEAKING_FLOOR_OPENNESS = 0.38;
const MOUTH_IDLE_PULSE_STRENGTH = 0.025;
const MOUTH_IDLE_PULSE_SPEED = 0.006;
const MOUTH_IDLE_CORNER_LIFT = -0.2;
const MOUTH_SPEAKING_CORNER_LIFT = -0.05;
const MOUTH_CENTER_X = 50;
const MOUTH_CENTER_Y = 65;
const MOUTH_BASE_HALF_WIDTH = 10.8;
const MOUTH_WIDTH_RANGE = 2.8;
const MOUTH_UPPER_CURVE_BASE = 1.15;
const MOUTH_UPPER_CURVE_RANGE = 0.7;
const MOUTH_LOWER_CURVE_BASE = 0.7;
const MOUTH_LOWER_CURVE_RANGE = 6.5;

/** SVG face layout constants (viewBox 0 0 100 100). */
const EYE_LEFT_CX = 38;
const EYE_RIGHT_CX = 62;
const EYE_CY = 42;
const EYE_RX = 6;
const EYE_RY_NORMAL = 7;
const EYE_RY_ERROR = 8;
const CHEEK_LEFT_CX = 32;
const CHEEK_RIGHT_CX = 68;
const CHEEK_CY = 55;
const CHEEK_RX = 7;
const CHEEK_RY = 4.6;
const NOSE_CX = 50;
const NOSE_CY = 52;
const NOSE_R = 1.4;

const MOUTH_FROWN_CY = 60;

/** Eye animation constants for natural expressions. */
const EYE_SPEAKING_SQUINT_MIN = 0.82;
const EYE_SPEAKING_SQUINT_MAX = 0.94;
const EYE_SPEAKING_OSCILLATION_SPEED = 0.002;
const EYE_LISTENING_WIDEN = 1.05;

interface SpringState {
  current: number;
  velocity: number;
  smoothedLevel: number;
}

interface AiFaceProps {
  state: ConversationState;
  audioLevel: number;
  /** Remote (AI) audio level [0.0, 1.0] for mouth animation during ai-speaking. */
  remoteAudioLevel: number;
  onMicToggle: () => void;
  /** Render the face at a larger size (for landscape mode). */
  large?: boolean;
  /** Active character ID for per-character color theming. */
  characterId?: CharacterId | null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getMouthHalfWidth(openness: number): number {
  return MOUTH_BASE_HALF_WIDTH + clamp01(openness) * MOUTH_WIDTH_RANGE;
}

function buildClosedMouthPath(openness: number, cornerLift: number): string {
  const halfWidth = getMouthHalfWidth(openness);
  const leftX = MOUTH_CENTER_X - halfWidth;
  const rightX = MOUTH_CENTER_X + halfWidth;
  const cornerY = MOUTH_CENTER_Y + cornerLift;
  const open = clamp01(openness);
  const upperControlY =
    cornerY - (MOUTH_UPPER_CURVE_BASE + open * MOUTH_UPPER_CURVE_RANGE);
  const lowerControlY =
    cornerY + (MOUTH_LOWER_CURVE_BASE + open * MOUTH_LOWER_CURVE_RANGE);
  return `M ${leftX} ${cornerY} Q ${MOUTH_CENTER_X} ${upperControlY}, ${rightX} ${cornerY} Q ${MOUTH_CENTER_X} ${lowerControlY}, ${leftX} ${cornerY} Z`;
}

function buildFrownClosedPath(): string {
  const leftX = MOUTH_CENTER_X - MOUTH_BASE_HALF_WIDTH;
  const rightX = MOUTH_CENTER_X + MOUTH_BASE_HALF_WIDTH;
  const upperControlY = MOUTH_CENTER_Y - 0.5;
  return `M ${leftX} ${MOUTH_CENTER_Y} Q ${MOUTH_CENTER_X} ${upperControlY}, ${rightX} ${MOUTH_CENTER_Y} Q ${MOUTH_CENTER_X} ${MOUTH_FROWN_CY}, ${leftX} ${MOUTH_CENTER_Y} Z`;
}

function normalizeRemoteAudioLevel(level: number): number {
  const normalized = (level - REMOTE_AUDIO_GATE) / REMOTE_AUDIO_NORMALIZE_RANGE;
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.pow(clamped, 0.82);
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
      return "animate-nod";
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
  remoteAudioLevel,
  onMicToggle,
  large = false,
  characterId,
}: AiFaceProps): ReactNode {
  const mouthRef = useRef<SVGPathElement>(null);
  const leftEyeRef = useRef<SVGEllipseElement>(null);
  const rightEyeRef = useRef<SVGEllipseElement>(null);
  const animationRef = useRef<number>(0);
  const springRef = useRef<SpringState>({
    current: MOUTH_REST_OPENNESS,
    velocity: 0,
    smoothedLevel: MOUTH_REST_OPENNESS,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const remoteAudioLevelRef = useRef(remoteAudioLevel);
  remoteAudioLevelRef.current = remoteAudioLevel;
  const speakingHoldUntilRef = useRef(0);

  // Keep one animation loop and drive mouth movement from state + remote audio level.
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const animate = (now: number): void => {
      const spring = springRef.current;
      const currentState = stateRef.current;
      const normalizedLevel = normalizeRemoteAudioLevel(
        remoteAudioLevelRef.current,
      );
      if (normalizedLevel > 0) {
        speakingHoldUntilRef.current = now + MOUTH_ACTIVE_HOLD_MS;
      }
      const shouldAnimateSpeaking =
        currentState === "ai-speaking" || now < speakingHoldUntilRef.current;

      let targetOpenness: number;
      let cornerLift = MOUTH_IDLE_CORNER_LIFT;
      if (currentState === "error") {
        targetOpenness = 0;
        spring.smoothedLevel = 0;
      } else if (shouldAnimateSpeaking) {
        const pulse = prefersReduced
          ? 0
          : ((Math.sin(now * MOUTH_IDLE_PULSE_SPEED) + 1) / 2) *
            MOUTH_IDLE_PULSE_STRENGTH;
        const expressiveLevel = Math.max(
          normalizedLevel,
          MOUTH_SPEAKING_FLOOR_OPENNESS + pulse,
        );
        spring.smoothedLevel +=
          (expressiveLevel - spring.smoothedLevel) * AUDIO_SMOOTHING;
        targetOpenness = spring.smoothedLevel;
        cornerLift = MOUTH_SPEAKING_CORNER_LIFT;
      } else {
        spring.smoothedLevel +=
          (MOUTH_REST_OPENNESS - spring.smoothedLevel) * AUDIO_SMOOTHING;
        targetOpenness = spring.smoothedLevel;
      }

      if (prefersReduced) {
        spring.current = targetOpenness;
        spring.velocity = 0;
      } else {
        const force = (targetOpenness - spring.current) * SPRING_STIFFNESS;
        spring.velocity = (spring.velocity + force) * SPRING_DAMPING;
        spring.current += spring.velocity;
      }

      if (mouthRef.current !== null) {
        if (currentState === "error") {
          mouthRef.current.setAttribute("d", buildFrownClosedPath());
          mouthRef.current.setAttribute("fill", "none");
          mouthRef.current.setAttribute("stroke-width", "2.5");
        } else {
          mouthRef.current.setAttribute(
            "d",
            buildClosedMouthPath(spring.current, cornerLift),
          );
          mouthRef.current.setAttribute("fill", "rgba(88, 36, 42, 0.28)");
          mouthRef.current.setAttribute("stroke-width", "1.6");
        }
      }

      // Eye animation: gentle squint during speaking, subtle life during idle
      const eyeBaseRy =
        currentState === "error" ? EYE_RY_ERROR : EYE_RY_NORMAL;
      let eyeRyAnimated = eyeBaseRy;
      if (currentState === "ai-speaking" && !prefersReduced) {
        const squintOscillation =
          Math.sin(now * EYE_SPEAKING_OSCILLATION_SPEED) * 0.5 + 0.5;
        const squintFactor =
          EYE_SPEAKING_SQUINT_MIN +
          squintOscillation * (EYE_SPEAKING_SQUINT_MAX - EYE_SPEAKING_SQUINT_MIN);
        eyeRyAnimated = eyeBaseRy * squintFactor;
      } else if (currentState === "listening" && !prefersReduced) {
        eyeRyAnimated = eyeBaseRy * EYE_LISTENING_WIDEN;
      }
      if (leftEyeRef.current !== null) {
        leftEyeRef.current.setAttribute("ry", String(eyeRyAnimated));
      }
      if (rightEyeRef.current !== null) {
        rightEyeRef.current.setAttribute("ry", String(eyeRyAnimated));
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

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
  const cheekOpacity =
    state === "ai-speaking" ? 0.45 : state === "listening" ? 0.34 : 0.28;
  const initialMouthPath =
    state === "error"
      ? buildFrownClosedPath()
      : buildClosedMouthPath(MOUTH_REST_OPENNESS, MOUTH_IDLE_CORNER_LIFT);
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
              ref={leftEyeRef}
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
              ref={rightEyeRef}
              cx={EYE_RIGHT_CX}
              cy={EYE_CY}
              rx={EYE_RX}
              ry={eyeRy}
              fill="white"
              className={showBlink ? "animate-blink" : ""}
              style={eyeStyle}
            />
            {/* Cheeks */}
            <ellipse
              cx={CHEEK_LEFT_CX}
              cy={CHEEK_CY}
              rx={CHEEK_RX}
              ry={CHEEK_RY}
              fill={`rgba(255, 214, 189, ${String(cheekOpacity)})`}
            />
            <ellipse
              cx={CHEEK_RIGHT_CX}
              cy={CHEEK_CY}
              rx={CHEEK_RX}
              ry={CHEEK_RY}
              fill={`rgba(255, 214, 189, ${String(cheekOpacity)})`}
            />
            {/* Nose */}
            <circle
              cx={NOSE_CX}
              cy={NOSE_CY}
              r={NOSE_R}
              fill="rgba(255, 255, 255, 0.72)"
            />
            {/* Mouth */}
            <path
              ref={mouthRef}
              d={initialMouthPath}
              fill={state === "error" ? "none" : "rgba(88, 36, 42, 0.28)"}
              stroke="white"
              strokeWidth={state === "error" ? 2.5 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
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
