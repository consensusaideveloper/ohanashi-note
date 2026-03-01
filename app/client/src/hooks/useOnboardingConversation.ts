// Lightweight conversation hook for the onboarding flow.
// Based on useConversation but without session persistence, summarization,
// session limits, or VoiceActionContext dependency.

import { useCallback, useEffect, useRef, useReducer } from "react";

import {
  SESSION_CONFIG,
  ONBOARDING_TOOLS,
  MIN_TRANSCRIPT_LENGTH,
  FONT_SIZE_LABELS,
  SPEAKING_SPEED_LABELS,
  SILENCE_DURATION_LABELS,
  CONFIRMATION_LEVEL_LABELS,
  RETRY_DELAY_MS,
} from "../lib/constants";
import { isNoiseTranscript } from "../lib/audio";
import { getCharacterById, CHARACTERS } from "../lib/characters";
import { buildOnboardingPrompt } from "../lib/prompt-builder";
import { saveUserProfile, getUserProfile } from "../lib/storage";
import { getRealtimeToken, endRealtimeSession } from "../lib/api";
import { useWebRTC } from "./useWebRTC";

import type { DataChannelServerEvent } from "../lib/realtime-protocol";
import type {
  ConfirmationLevel,
  ConversationState,
  ErrorType,
  FontSizeLevel,
  SilenceDuration,
  SpeakingSpeed,
  TranscriptEntry,
} from "../types/conversation";

// --- End-conversation flow ---
const END_CONVERSATION_FAREWELL_DELAY_MS = 3000;
const END_CONVERSATION_RESPONSE_COUNT = 2;

// --- State machine ---

interface State {
  conversationState: ConversationState;
  errorType: ErrorType | null;
  transcript: TranscriptEntry[];
  pendingAssistantText: string;
}

type Action =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "AI_SPEAKING" }
  | { type: "AI_DONE" }
  | { type: "DISCONNECT" }
  | { type: "ERROR"; errorType: ErrorType }
  | { type: "ADD_USER_TRANSCRIPT"; text: string }
  | { type: "APPEND_ASSISTANT_DELTA"; delta: string }
  | { type: "FINALIZE_ASSISTANT_TRANSCRIPT"; text: string };

const initialState: State = {
  conversationState: "idle",
  errorType: null,
  transcript: [],
  pendingAssistantText: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "CONNECT":
      return { ...state, conversationState: "connecting", errorType: null };
    case "CONNECTED":
      return { ...state, conversationState: "listening" };
    case "AI_SPEAKING":
      return { ...state, conversationState: "ai-speaking" };
    case "AI_DONE":
      return { ...state, conversationState: "listening" };
    case "DISCONNECT":
      return { ...initialState };
    case "ERROR":
      return {
        ...state,
        conversationState: "error",
        errorType: action.errorType,
      };
    case "ADD_USER_TRANSCRIPT":
      return {
        ...state,
        transcript: [
          ...state.transcript,
          { role: "user", text: action.text, timestamp: Date.now() },
        ],
      };
    case "APPEND_ASSISTANT_DELTA":
      return {
        ...state,
        pendingAssistantText: state.pendingAssistantText + action.delta,
      };
    case "FINALIZE_ASSISTANT_TRANSCRIPT":
      return {
        ...state,
        transcript: [
          ...state.transcript,
          { role: "assistant", text: action.text, timestamp: Date.now() },
        ],
        pendingAssistantText: "",
      };
    default:
      return state;
  }
}

// --- Hook ---

interface UseOnboardingConversationProps {
  /** Callback from FontSizeContext to apply font size changes immediately. */
  setFontSize: (level: FontSizeLevel) => void;
  /** Called when the onboarding conversation finishes (after farewell). */
  onComplete: () => void;
}

export interface UseOnboardingConversationReturn {
  state: ConversationState;
  errorType: ErrorType | null;
  transcript: TranscriptEntry[];
  pendingAssistantText: string;
  audioLevel: number;
  start: () => void;
  stop: () => void;
  retry: () => void;
}

export function useOnboardingConversation({
  setFontSize,
  onComplete,
}: UseOnboardingConversationProps): UseOnboardingConversationReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  const webrtc = useWebRTC();

  // End-conversation countdown
  const endConversationCountdownRef = useRef<number | null>(null);

  // Session key for server-side tracking
  const sessionKeyRef = useRef<string>("");

  // Track whether AI is currently speaking (for UI state)
  const aiSpeakingRef = useRef(false);

  // Stable ref for stop
  const stopRef = useRef<() => void>(() => {});

  // Stable ref for onComplete to avoid stale closures
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Stable ref for setFontSize
  const setFontSizeRef = useRef(setFontSize);
  useEffect(() => {
    setFontSizeRef.current = setFontSize;
  }, [setFontSize]);

  // Handle function calls from the Realtime API
  const handleFunctionCall = useCallback(
    (callId: string, functionName: string, argsJson: string): void => {
      const sendResult = (output: string): void => {
        webrtc.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output,
          },
        });
        webrtc.send({ type: "response.create" });
      };

      try {
        if (functionName === "end_conversation") {
          endConversationCountdownRef.current = END_CONVERSATION_RESPONSE_COUNT;
          sendResult(
            JSON.stringify({
              success: true,
              message: "会話を終了します。短い別れの挨拶をしてください。",
            }),
          );
          return;
        }

        if (functionName === "update_user_name") {
          const args = JSON.parse(argsJson) as { name: string };
          const trimmedName = args.name.trim();
          void getUserProfile()
            .then((existingProfile) => {
              const profile = existingProfile ?? {
                name: "",
                updatedAt: Date.now(),
              };
              return saveUserProfile({
                ...profile,
                name: trimmedName,
                updatedAt: Date.now(),
              });
            })
            .then(() => {
              sendResult(
                JSON.stringify({
                  success: true,
                  message: `お名前を「${trimmedName}」さんに設定しました`,
                }),
              );
            })
            .catch(() => {
              sendResult(
                JSON.stringify({ error: "操作中にエラーが発生しました" }),
              );
            });
          return;
        }

        if (functionName === "change_character") {
          const args = JSON.parse(argsJson) as { character_name: string };
          const character = CHARACTERS.find(
            (c) => c.name === args.character_name,
          );
          if (character === undefined) {
            sendResult(
              JSON.stringify({
                error: `「${args.character_name}」というキャラクターは見つかりません`,
              }),
            );
            return;
          }
          void getUserProfile()
            .then((existingProfile) => {
              const profile = existingProfile ?? {
                name: "",
                updatedAt: Date.now(),
              };
              return saveUserProfile({
                ...profile,
                characterId: character.id,
                updatedAt: Date.now(),
              });
            })
            .then(() => {
              sendResult(
                JSON.stringify({
                  success: true,
                  message: `次回の会話から「${character.name}」がお相手します`,
                }),
              );
            })
            .catch(() => {
              sendResult(
                JSON.stringify({ error: "操作中にエラーが発生しました" }),
              );
            });
          return;
        }

        if (functionName === "change_font_size") {
          const args = JSON.parse(argsJson) as { level: string };
          const level = args.level as FontSizeLevel;
          setFontSizeRef.current(level);
          const label = FONT_SIZE_LABELS[level] ?? level;
          sendResult(
            JSON.stringify({
              success: true,
              message: `文字の大きさを「${label}」に変更しました`,
            }),
          );
          return;
        }

        if (functionName === "update_speaking_preferences") {
          const args = JSON.parse(argsJson) as {
            speaking_speed?: string;
            silence_duration?: string;
            confirmation_level?: string;
          };
          void getUserProfile()
            .then((existingProfile) => {
              const profile = existingProfile ?? {
                name: "",
                updatedAt: Date.now(),
              };
              return saveUserProfile({
                ...profile,
                ...(args.speaking_speed !== undefined && {
                  speakingSpeed: args.speaking_speed as SpeakingSpeed,
                }),
                ...(args.silence_duration !== undefined && {
                  silenceDuration: args.silence_duration as SilenceDuration,
                }),
                ...(args.confirmation_level !== undefined && {
                  confirmationLevel: args.confirmation_level as
                    | "frequent"
                    | "normal"
                    | "minimal",
                }),
                updatedAt: Date.now(),
              });
            })
            .then(() => {
              const changedParts: string[] = [];
              if (args.speaking_speed !== undefined) {
                changedParts.push(
                  `話す速さを「${SPEAKING_SPEED_LABELS[args.speaking_speed as SpeakingSpeed]}」`,
                );
              }
              if (args.silence_duration !== undefined) {
                changedParts.push(
                  `待ち時間を「${SILENCE_DURATION_LABELS[args.silence_duration as SilenceDuration]}」`,
                );
              }
              if (args.confirmation_level !== undefined) {
                changedParts.push(
                  `確認の頻度を「${CONFIRMATION_LEVEL_LABELS[args.confirmation_level as ConfirmationLevel]}」`,
                );
              }
              const msg =
                changedParts.length > 0
                  ? `${changedParts.join("、")}に変更しました`
                  : "話し方の設定を更新しました";
              sendResult(JSON.stringify({ success: true, message: msg }));
            })
            .catch(() => {
              sendResult(
                JSON.stringify({ error: "操作中にエラーが発生しました" }),
              );
            });
          return;
        }

        sendResult(JSON.stringify({ error: "Unknown function" }));
      } catch {
        sendResult(JSON.stringify({ error: "操作中にエラーが発生しました" }));
      }
    },
    [webrtc],
  );

  // Handle incoming data channel events
  const handleServerEvent = useCallback(
    (event: DataChannelServerEvent): void => {
      switch (event.type) {
        case "session.created":
          // Session is ready (pre-configured via client_secrets)
          dispatch({ type: "CONNECTED" });
          // Trigger AI to greet the user first
          webrtc.send({ type: "response.create" });
          break;

        case "response.audio_transcript.delta":
          // AI is speaking — use transcript delta as a proxy for audio state
          if (!aiSpeakingRef.current) {
            aiSpeakingRef.current = true;
            dispatch({ type: "AI_SPEAKING" });
          }
          dispatch({ type: "APPEND_ASSISTANT_DELTA", delta: event.delta });
          break;

        case "response.audio_transcript.done":
          dispatch({
            type: "FINALIZE_ASSISTANT_TRANSCRIPT",
            text: event.transcript,
          });
          break;

        case "conversation.item.input_audio_transcription.completed": {
          const trimmed = event.transcript.trim();
          if (
            trimmed.length >= MIN_TRANSCRIPT_LENGTH &&
            !isNoiseTranscript(trimmed)
          ) {
            dispatch({ type: "ADD_USER_TRANSCRIPT", text: trimmed });
          }
          break;
        }

        case "response.done": {
          aiSpeakingRef.current = false;
          dispatch({ type: "AI_DONE" });

          // End-conversation flow: count down response.done events
          if (endConversationCountdownRef.current !== null) {
            endConversationCountdownRef.current -= 1;
            if (endConversationCountdownRef.current <= 0) {
              endConversationCountdownRef.current = null;
              // Farewell response complete — delay for audio playback, then stop
              setTimeout(() => {
                stopRef.current();
              }, END_CONVERSATION_FAREWELL_DELAY_MS);
              break;
            }
          }
          break;
        }

        case "input_audio_buffer.speech_started":
          // User started speaking — OpenAI handles barge-in automatically
          // Cancel pending end-conversation flow if user interrupts
          endConversationCountdownRef.current = null;
          aiSpeakingRef.current = false;
          break;

        case "response.output_item.done": {
          const { item } = event;
          if (
            item.type === "function_call" &&
            item.call_id !== undefined &&
            item.name !== undefined &&
            item.arguments !== undefined
          ) {
            handleFunctionCall(item.call_id, item.name, item.arguments);
          }
          break;
        }

        case "error":
          console.error("OpenAI Realtime API error (onboarding):", {
            errorType: event.error.type,
            errorCode: event.error.code,
            errorMessage: event.error.message,
          });
          dispatch({ type: "ERROR", errorType: "aiUnavailable" });
          break;

        default:
          break;
      }
    },
    [webrtc, handleFunctionCall],
  );

  // Register/unregister message handler
  useEffect(() => {
    webrtc.addMessageHandler(handleServerEvent);
    return () => {
      webrtc.removeMessageHandler(handleServerEvent);
    };
  }, [webrtc, handleServerEvent]);

  // Watch for WebRTC connection failures
  useEffect(() => {
    if (webrtc.status === "failed") {
      dispatch({ type: "ERROR", errorType: "network" });
    }
  }, [webrtc.status]);

  // Start the onboarding conversation
  const start = useCallback((): void => {
    dispatch({ type: "CONNECT" });

    // Step 1: Request mic access first (must be in user gesture context for iOS)
    webrtc
      .requestMicAccess()
      .then((micStream) => {
        // Step 2: Build session config
        const character = getCharacterById("character-a");
        const instructions = buildOnboardingPrompt();

        const sessionConfig = {
          instructions,
          voice: character.voice,
          tools: [...ONBOARDING_TOOLS],
          turn_detection: SESSION_CONFIG.turn_detection,
        };

        // Step 3: Get ephemeral token from server
        return getRealtimeToken(sessionConfig, true).then(
          ({ token, sessionKey }) => {
            sessionKeyRef.current = sessionKey;

            // Step 4: Connect WebRTC with token and mic stream
            return webrtc.connect(token, micStream);
          },
        );
      })
      .catch((err: unknown) => {
        console.error("Failed to start onboarding conversation:", {
          error: err,
        });
        if (
          err instanceof Error &&
          (err.name === "NotAllowedError" ||
            err.name === "NotFoundError" ||
            err.message.includes("getUserMedia"))
        ) {
          dispatch({ type: "ERROR", errorType: "microphone" });
        } else {
          dispatch({ type: "ERROR", errorType: "network" });
        }
      });
  }, [webrtc]);

  // Stop the conversation and clean up
  const stop = useCallback((): void => {
    endConversationCountdownRef.current = null;
    aiSpeakingRef.current = false;

    webrtc.disconnect();
    dispatch({ type: "DISCONNECT" });

    // End server-side session tracking
    const key = sessionKeyRef.current;
    if (key !== "") {
      endRealtimeSession(key).catch((err: unknown) => {
        console.error("Failed to end onboarding realtime session:", {
          error: err,
        });
      });
    }
    sessionKeyRef.current = "";

    // Notify parent that onboarding is complete
    onCompleteRef.current();
  }, [webrtc]);

  // Keep stopRef in sync
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Retry after an error
  const retry = useCallback((): void => {
    webrtc.disconnect();
    dispatch({ type: "DISCONNECT" });
    setTimeout(() => {
      start();
    }, RETRY_DELAY_MS);
  }, [webrtc, start]);

  return {
    state: state.conversationState,
    errorType: state.errorType,
    transcript: state.transcript,
    pendingAssistantText: state.pendingAssistantText,
    audioLevel: webrtc.audioLevel,
    start,
    stop,
    retry,
  };
}
