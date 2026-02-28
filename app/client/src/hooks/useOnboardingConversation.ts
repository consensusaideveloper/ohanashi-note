// Lightweight conversation hook for the onboarding flow.
// Based on useConversation but without session persistence, summarization,
// session limits, or VoiceActionContext dependency.

import { useCallback, useEffect, useRef, useReducer } from "react";

import {
  SESSION_CONFIG,
  ONBOARDING_TOOLS,
  POST_SPEECH_COOLDOWN_MS,
  MIN_TRANSCRIPT_LENGTH,
  BARGE_IN_RMS_THRESHOLD,
  BARGE_IN_CONSECUTIVE_CHUNKS,
  FONT_SIZE_LABELS,
  SPEAKING_SPEED_LABELS,
  SILENCE_DURATION_LABELS,
  CONFIRMATION_LEVEL_LABELS,
} from "../lib/constants";
import { isNoiseTranscript } from "../lib/audio";
import { getCharacterById, CHARACTERS } from "../lib/characters";
import { buildOnboardingPrompt } from "../lib/prompt-builder";
import { saveUserProfile, getUserProfile } from "../lib/storage";
import { useWebSocket } from "./useWebSocket";
import { useAudioInput } from "./useAudioInput";
import { useAudioOutput } from "./useAudioOutput";

import type { ServerEvent } from "../lib/websocket-protocol";
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

  const ws = useWebSocket();
  const audioOutput = useAudioOutput();

  // Track whether session.update has been sent
  const sessionConfigSentRef = useRef(false);

  // Echo suppression refs
  const audioGatedRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bargeInCountRef = useRef(0);

  // Client-side noise gate: track whether user speech is actively detected
  // End-conversation countdown
  const endConversationCountdownRef = useRef<number | null>(null);

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

  const clearCooldownTimer = useCallback((): void => {
    if (cooldownTimerRef.current !== null) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  // Audio chunk handler with echo suppression, barge-in, and noise gate
  const handleAudioChunk = useCallback(
    (base64: string, rmsLevel: number): void => {
      if (audioGatedRef.current) {
        if (rmsLevel >= BARGE_IN_RMS_THRESHOLD) {
          bargeInCountRef.current += 1;
          if (bargeInCountRef.current >= BARGE_IN_CONSECUTIVE_CHUNKS) {
            audioGatedRef.current = false;
            bargeInCountRef.current = 0;
            clearCooldownTimer();
            audioOutput.stopPlayback();
            endConversationCountdownRef.current = null;
            ws.send({ type: "input_audio_buffer.clear" });
            // Fall through to send audio below
          } else {
            return;
          }
        } else {
          bargeInCountRef.current = 0;
          return;
        }
      }

      ws.send({ type: "input_audio_buffer.append", audio: base64 });
    },
    [ws, audioOutput, clearCooldownTimer],
  );

  const audioInput = useAudioInput({ onAudioChunk: handleAudioChunk });

  // Handle function calls from the Realtime API
  const handleFunctionCall = useCallback(
    (callId: string, functionName: string, argsJson: string): void => {
      const sendResult = (output: string): void => {
        ws.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output,
          },
        });
        ws.send({ type: "response.create" });
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
    [ws],
  );

  // Handle incoming server events
  const handleServerEvent = useCallback(
    (event: ServerEvent): void => {
      switch (event.type) {
        case "session.created":
        case "session.updated":
          if (
            event.type === "session.created" &&
            !sessionConfigSentRef.current
          ) {
            sessionConfigSentRef.current = true;
            const character = getCharacterById("character-a");
            const instructions = buildOnboardingPrompt();
            ws.send({
              type: "session.update",
              session: {
                ...SESSION_CONFIG,
                voice: character.voice,
                instructions,
                tools: [...ONBOARDING_TOOLS],
                tool_choice: "auto",
              },
            });
          }
          if (event.type === "session.updated") {
            dispatch({ type: "CONNECTED" });
            // Trigger AI to greet the user first
            ws.send({ type: "response.create" });
          }
          break;

        case "response.audio.delta":
          if (state.conversationState !== "ai-speaking") {
            dispatch({ type: "AI_SPEAKING" });
            ws.send({ type: "input_audio_buffer.clear" });
          }
          audioGatedRef.current = true;
          bargeInCountRef.current = 0;
          clearCooldownTimer();
          audioOutput.enqueueAudio(event.delta);
          break;

        case "response.audio_transcript.delta":
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
          dispatch({ type: "AI_DONE" });

          // End-conversation flow
          if (endConversationCountdownRef.current !== null) {
            endConversationCountdownRef.current -= 1;
            if (endConversationCountdownRef.current <= 0) {
              endConversationCountdownRef.current = null;
              setTimeout(() => {
                stopRef.current();
              }, END_CONVERSATION_FAREWELL_DELAY_MS);
              break;
            }
          }

          // Post-speech cooldown
          clearCooldownTimer();
          cooldownTimerRef.current = setTimeout(() => {
            audioGatedRef.current = false;
            cooldownTimerRef.current = null;
          }, POST_SPEECH_COOLDOWN_MS);
          break;
        }

        case "input_audio_buffer.speech_started":
          audioOutput.stopPlayback();
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
    [
      ws,
      audioOutput,
      state.conversationState,
      handleFunctionCall,
      clearCooldownTimer,
    ],
  );

  // Register/unregister message handler
  useEffect(() => {
    ws.addMessageHandler(handleServerEvent);
    return () => {
      ws.removeMessageHandler(handleServerEvent);
    };
  }, [ws, handleServerEvent]);

  // Watch for WebSocket connection failures
  useEffect(() => {
    if (ws.status === "failed") {
      dispatch({ type: "ERROR", errorType: "network" });
    }
  }, [ws.status]);

  // Start the onboarding conversation
  const start = useCallback((): void => {
    dispatch({ type: "CONNECT" });
    sessionConfigSentRef.current = false;

    ws.connect({ onboarding: true });

    // Start audio capture
    audioInput.startCapture().catch(() => {
      dispatch({ type: "ERROR", errorType: "microphone" });
    });
  }, [ws, audioInput]);

  // Stop the conversation and clean up
  const stop = useCallback((): void => {
    clearCooldownTimer();
    audioGatedRef.current = false;
    bargeInCountRef.current = 0;
    endConversationCountdownRef.current = null;

    audioInput.stopCapture();
    audioOutput.stopPlayback();
    ws.disconnect();
    dispatch({ type: "DISCONNECT" });

    // Notify parent that onboarding is complete
    onCompleteRef.current();
  }, [ws, audioInput, audioOutput, clearCooldownTimer]);

  // Keep stopRef in sync
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Retry after an error
  const retry = useCallback((): void => {
    audioOutput.stopPlayback();
    ws.disconnect();
    dispatch({ type: "DISCONNECT" });
    // Small delay before reconnecting
    setTimeout(() => {
      start();
    }, 300);
  }, [ws, audioOutput, start]);

  return {
    state: state.conversationState,
    errorType: state.errorType,
    transcript: state.transcript,
    pendingAssistantText: state.pendingAssistantText,
    audioLevel: audioInput.audioLevel,
    start,
    stop,
    retry,
  };
}
