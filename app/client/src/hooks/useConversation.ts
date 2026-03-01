import { useCallback, useEffect, useRef, useReducer, useState } from "react";

import {
  SESSION_CONFIG,
  REALTIME_TOOLS,
  CROSS_CATEGORY_RECORDS_LIMIT,
  FOCUSED_SUMMARIES_LIMIT,
  GUIDED_RECENT_SUMMARIES_LIMIT,
  RETRY_DELAY_MS,
  MAX_SESSION_DURATION_MS,
  SESSION_WARNING_THRESHOLD,
  MIN_TRANSCRIPT_LENGTH,
  SILENCE_DURATION_MS_MAP,
} from "../lib/constants";
import { getCharacterById } from "../lib/characters";
import {
  buildSessionPrompt,
  buildGuidedSessionPrompt,
} from "../lib/prompt-builder";
import { listFamilyMembers, listAccessPresets } from "../lib/family-api";
import {
  saveConversation,
  updateConversation,
  listConversations,
  getConversation,
  getUserProfile,
  saveUserProfile,
  saveAudioRecording,
} from "../lib/storage";
import { isNoiseTranscript } from "../lib/audio";
import { computeContentHash, computeBlobHash } from "../lib/integrity";
import { QUESTION_CATEGORIES, getQuestionsByCategory } from "../lib/questions";
import {
  requestSummarize,
  requestEnhancedSummarize,
  connectRealtimeSession,
  endRealtimeSession,
} from "../lib/api";
import {
  searchPastConversations,
  getNoteEntriesForAI,
} from "../lib/conversation-search";
import { useVoiceActionRef } from "../contexts/VoiceActionContext";

import type { VoiceActionCallbacks } from "../contexts/VoiceActionContext";
import { useWebRTC } from "./useWebRTC";

import type {
  PastConversationContext,
  GuidedPastContext,
  FamilyContext,
} from "../lib/prompt-builder";
import type { DataChannelServerEvent } from "../lib/realtime-protocol";
import type {
  CharacterId,
  ConversationRecord,
  ConversationState,
  ErrorType,
  NoteEntry,
  QuestionCategory,
  SpeakingPreferences,
  TranscriptEntry,
  VoiceActionResult,
} from "../types/conversation";

// --- End-conversation flow ---
/** Delay (ms) after farewell response.done before calling stop(), allowing audio playback to complete. */
const END_CONVERSATION_FAREWELL_DELAY_MS = 3000;
/** Safety timeout if farewell events are not observed as expected. */
const END_CONVERSATION_FALLBACK_MS = 12000;
/** MediaRecorder timeslice for chunked buffering during long sessions. */
const RECORDING_CHUNK_MS = 1000;
const DEFAULT_RECORDING_MIME_TYPE = "audio/webm";
const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

// --- State machine ---

type SummaryStatus = "idle" | "pending" | "completed" | "failed";

interface State {
  conversationState: ConversationState;
  errorType: ErrorType | null;
  transcript: TranscriptEntry[];
  /** Accumulates partial transcript deltas for the current assistant turn. */
  pendingAssistantText: string;
  summaryStatus: SummaryStatus;
  /** Remaining session time in milliseconds, or null when idle. */
  remainingMs: number | null;
  /** Whether the session time warning has been shown. */
  sessionWarningShown: boolean;
}

type Action =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "START_LISTENING" }
  | { type: "AI_SPEAKING" }
  | { type: "AI_DONE" }
  | { type: "DISCONNECT" }
  | { type: "ERROR"; errorType: ErrorType }
  | { type: "ADD_USER_TRANSCRIPT"; text: string }
  | { type: "APPEND_ASSISTANT_DELTA"; delta: string }
  | { type: "FINALIZE_ASSISTANT_TRANSCRIPT"; text: string }
  | { type: "SUMMARY_PENDING" }
  | { type: "SUMMARY_COMPLETED" }
  | { type: "SUMMARY_FAILED" }
  | { type: "TICK_TIMER"; remainingMs: number }
  | { type: "SESSION_WARNING_SHOWN" };

const initialState: State = {
  conversationState: "idle",
  errorType: null,
  transcript: [],
  pendingAssistantText: "",
  summaryStatus: "idle",
  remainingMs: null,
  sessionWarningShown: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "CONNECT":
      return {
        ...state,
        conversationState: "connecting",
        errorType: null,
      };
    case "CONNECTED":
      return {
        ...state,
        conversationState: "listening",
      };
    case "START_LISTENING":
      return {
        ...state,
        conversationState: "listening",
        pendingAssistantText: "",
      };
    case "AI_SPEAKING":
      return {
        ...state,
        conversationState: "ai-speaking",
      };
    case "AI_DONE":
      return {
        ...state,
        conversationState: "listening",
      };
    case "DISCONNECT":
      return {
        ...initialState,
        summaryStatus: state.summaryStatus,
        remainingMs: null,
        sessionWarningShown: false,
      };
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
    case "SUMMARY_PENDING":
      return { ...state, summaryStatus: "pending" };
    case "SUMMARY_COMPLETED":
      return { ...state, summaryStatus: "completed" };
    case "SUMMARY_FAILED":
      return { ...state, summaryStatus: "failed" };
    case "TICK_TIMER":
      return { ...state, remainingMs: action.remainingMs };
    case "SESSION_WARNING_SHOWN":
      return { ...state, sessionWarningShown: true };
    default:
      return state;
  }
}

// --- Hook ---

export interface UseConversationReturn {
  state: ConversationState;
  errorType: ErrorType | null;
  transcript: TranscriptEntry[];
  pendingAssistantText: string;
  audioLevel: number;
  characterId: CharacterId | null;
  summaryStatus: SummaryStatus;
  /** Remaining session time in milliseconds, or null when idle. */
  remainingMs: number | null;
  /** Whether the session time warning is active. */
  sessionWarningShown: boolean;
  /** Monotonic signal incremented when AI-triggered auto-end is completed. */
  autoEndSignal: number;
  /** Start a conversation. Pass null for category to use AI-guided mode. */
  start: (characterId: CharacterId, category: QuestionCategory | null) => void;
  /** Stop the conversation and disconnect. */
  stop: () => void;
  /** Retry after an error. */
  retry: () => void;
  /** Update speaking preferences (applied to the next session). */
  updateSessionConfig: (preferences: SpeakingPreferences) => void;
}

/** Collect latest note entries from past records for change-aware summarization. */
function collectCurrentNoteEntries(
  records: readonly ConversationRecord[],
  category: QuestionCategory | null,
): NoteEntry[] {
  if (records.length === 0) return [];

  const questionIds =
    category !== null
      ? new Set(getQuestionsByCategory(category).map((q) => q.id))
      : null;

  const entryMap = new Map<string, NoteEntry>();
  const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);

  for (const record of sorted) {
    if (record.noteEntries === undefined) continue;
    for (const entry of record.noteEntries) {
      if (questionIds === null || questionIds.has(entry.questionId)) {
        entryMap.set(entry.questionId, entry);
      }
    }
  }

  return Array.from(entryMap.values());
}

/**
 * Try to dispatch a function call to voice action callbacks.
 * Returns null if the function name is not a recognized voice action.
 */
function dispatchVoiceAction(
  callbacks: VoiceActionCallbacks,
  functionName: string,
  argsJson: string,
): VoiceActionResult | Promise<VoiceActionResult> | null {
  switch (functionName) {
    // Tier 0: Navigation
    case "navigate_to_screen": {
      const args = JSON.parse(argsJson) as { screen: string };
      return callbacks.navigateToScreen(args.screen);
    }
    case "view_note_category": {
      const args = JSON.parse(argsJson) as { category: string };
      return callbacks.viewNoteCategory(args.category);
    }
    case "filter_conversation_history": {
      const args = JSON.parse(argsJson) as {
        category?: string;
      };
      return callbacks.filterHistory({ category: args.category });
    }
    // Tier 1: Settings
    case "change_font_size": {
      const args = JSON.parse(argsJson) as { level: string };
      return callbacks.changeFontSize(args.level);
    }
    case "change_character": {
      const args = JSON.parse(argsJson) as { character_name: string };
      return callbacks.changeCharacter(args.character_name);
    }
    case "update_user_name": {
      const args = JSON.parse(argsJson) as { name: string };
      return callbacks.updateUserName(args.name);
    }
    case "update_speaking_preferences": {
      const args = JSON.parse(argsJson) as {
        speaking_speed?: string;
        silence_duration?: string;
        confirmation_level?: string;
      };
      return callbacks.updateSpeakingPreferences({
        speakingSpeed: args.speaking_speed,
        silenceDuration: args.silence_duration,
        confirmationLevel: args.confirmation_level,
      });
    }
    // Tier 1: Access preset management
    case "update_access_preset": {
      const args = JSON.parse(argsJson) as {
        family_member_name: string;
        category: string;
        action: string;
      };
      return callbacks.updateAccessPreset({
        familyMemberName: args.family_member_name,
        category: args.category,
        action: args.action as "grant" | "revoke",
      });
    }
    // Tier 2: Confirmation-required
    case "start_focused_conversation": {
      const args = JSON.parse(argsJson) as { category: string };
      return callbacks.requestStartConversation(args.category);
    }
    case "create_family_invitation": {
      const args = JSON.parse(argsJson) as {
        relationship: string;
        relationship_label: string;
      };
      return callbacks.requestCreateInvitation({
        relationship: args.relationship,
        relationshipLabel: args.relationship_label,
      });
    }
    default:
      return null;
  }
}

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

export function useConversation(): UseConversationReturn {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [autoEndSignal, setAutoEndSignal] = useState(0);

  const webrtc = useWebRTC();
  const voiceActionRef = useVoiceActionRef();

  // Session timer refs
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);

  const TIMER_INTERVAL_MS = 1000;

  // Conversation persistence refs
  const conversationIdRef = useRef<string | null>(null);
  const characterIdRef = useRef<CharacterId | null>(null);
  const categoryRef = useRef<QuestionCategory | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  // Past conversation context (loaded on start, used in session config)
  const pastContextRef = useRef<PastConversationContext | null>(null);

  // Guided mode context (loaded on start when category is null)
  const guidedContextRef = useRef<GuidedPastContext | null>(null);

  // User name (loaded on start, used in session config)
  const userNameRef = useRef<string | null>(null);

  // All conversation records (loaded on start, used for function call search)
  const allRecordsRef = useRef<ConversationRecord[]>([]);

  // Family context (loaded on start, used in session config)
  const familyContextRef = useRef<FamilyContext | null>(null);

  // Speaking preferences (loaded on start, used in session config)
  const speakingPrefsRef = useRef<SpeakingPreferences>({
    speakingSpeed: "normal",
    silenceDuration: "normal",
    confirmationLevel: "normal",
  });

  // Turn detection config (stored for session.update after connection).
  // Uses widened types since silence_duration_ms varies by user preference.
  const turnDetectionRef = useRef<{
    type: "server_vad";
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
    create_response: boolean;
  }>({ ...SESSION_CONFIG.turn_detection });

  // Session key for server-side tracking
  const sessionKeyRef = useRef<string>("");

  // Local recording refs (user microphone only)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>(DEFAULT_RECORDING_MIME_TYPE);

  // Stable ref for stop so the session timer can call it without stale closures
  const stopRef = useRef<() => void>(() => {});

  // End-conversation flow refs
  const endConversationRequestedRef = useRef(false);
  const endConversationFarewellDetectedRef = useRef(false);
  const endConversationStopTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const endConversationFallbackTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const autoEndStopTriggerRef = useRef(false);

  // Track whether AI is currently speaking (for UI state)
  const aiSpeakingRef = useRef(false);

  // Keep transcript ref in sync with reducer state
  useEffect(() => {
    transcriptRef.current = state.transcript;
  }, [state.transcript]);

  const discardLocalRecording = useCallback((): void => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    if (recorder !== null) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Best-effort cleanup
        }
      }
    }

    const stream = recordingStreamRef.current;
    recordingStreamRef.current = null;
    if (stream !== null) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    recordingChunksRef.current = [];
    recordingMimeTypeRef.current = DEFAULT_RECORDING_MIME_TYPE;
  }, []);

  const startLocalRecording = useCallback(
    (micStream: MediaStream): void => {
      discardLocalRecording();

      if (typeof MediaRecorder === "undefined") {
        return;
      }

      const clonedTracks = micStream
        .getAudioTracks()
        .map((track) => track.clone());
      if (clonedTracks.length === 0) {
        return;
      }

      const recordingStream = new MediaStream(clonedTracks);
      recordingStreamRef.current = recordingStream;
      recordingChunksRef.current = [];

      try {
        const preferredMimeType = pickRecorderMimeType();
        const recorder =
          preferredMimeType !== ""
            ? new MediaRecorder(recordingStream, {
                mimeType: preferredMimeType,
              })
            : new MediaRecorder(recordingStream);

        mediaRecorderRef.current = recorder;
        recordingMimeTypeRef.current =
          recorder.mimeType || preferredMimeType || DEFAULT_RECORDING_MIME_TYPE;

        recorder.ondataavailable = (event: BlobEvent): void => {
          if (event.data.size > 0) {
            recordingChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = (): void => {
          console.error("Local audio recorder error");
        };

        recorder.start(RECORDING_CHUNK_MS);
      } catch {
        mediaRecorderRef.current = null;
        for (const track of recordingStream.getTracks()) {
          track.stop();
        }
        recordingStreamRef.current = null;
        recordingChunksRef.current = [];
        recordingMimeTypeRef.current = DEFAULT_RECORDING_MIME_TYPE;
      }
    },
    [discardLocalRecording],
  );

  const stopLocalRecording = useCallback(async (): Promise<{
    blob: Blob;
    mimeType: string;
  } | null> => {
    const recorder = mediaRecorderRef.current;
    const recordingStream = recordingStreamRef.current;
    mediaRecorderRef.current = null;
    recordingStreamRef.current = null;

    const finalize = (): { blob: Blob; mimeType: string } | null => {
      if (recordingStream !== null) {
        for (const track of recordingStream.getTracks()) {
          track.stop();
        }
      }

      const mimeType = recordingMimeTypeRef.current;
      recordingMimeTypeRef.current = DEFAULT_RECORDING_MIME_TYPE;

      const chunks = recordingChunksRef.current;
      recordingChunksRef.current = [];
      if (chunks.length === 0) {
        return null;
      }

      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        return null;
      }

      return {
        blob,
        mimeType: blob.type || mimeType || DEFAULT_RECORDING_MIME_TYPE,
      };
    };

    if (recorder === null) {
      return finalize();
    }

    if (recorder.state === "inactive") {
      return finalize();
    }

    return new Promise((resolve) => {
      const handleStop = (): void => {
        recorder.removeEventListener("error", handleError);
        resolve(finalize());
      };

      const handleError = (): void => {
        recorder.removeEventListener("stop", handleStop);
        if (recordingStream !== null) {
          for (const track of recordingStream.getTracks()) {
            track.stop();
          }
        }
        recordingChunksRef.current = [];
        recordingMimeTypeRef.current = DEFAULT_RECORDING_MIME_TYPE;
        resolve(null);
      };

      recorder.addEventListener("stop", handleStop, { once: true });
      recorder.addEventListener("error", handleError, { once: true });

      try {
        recorder.stop();
      } catch {
        handleError();
      }
    });
  }, []);

  const clearEndConversationTimers = useCallback((): void => {
    if (endConversationStopTimeoutRef.current !== null) {
      clearTimeout(endConversationStopTimeoutRef.current);
      endConversationStopTimeoutRef.current = null;
    }
    if (endConversationFallbackTimeoutRef.current !== null) {
      clearTimeout(endConversationFallbackTimeoutRef.current);
      endConversationFallbackTimeoutRef.current = null;
    }
  }, []);

  const resetEndConversationFlow = useCallback((): void => {
    endConversationRequestedRef.current = false;
    endConversationFarewellDetectedRef.current = false;
    clearEndConversationTimers();
  }, [clearEndConversationTimers]);

  // Handle function calls from the Realtime API
  const handleFunctionCall = useCallback(
    (callId: string, functionName: string, argsJson: string): void => {
      /** Send function call output back to the Realtime API and trigger a response. */
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
          endConversationRequestedRef.current = true;
          endConversationFarewellDetectedRef.current = false;
          clearEndConversationTimers();
          endConversationFallbackTimeoutRef.current = setTimeout(() => {
            autoEndStopTriggerRef.current = true;
            resetEndConversationFlow();
            stopRef.current();
          }, END_CONVERSATION_FALLBACK_MS);

          sendResult(
            JSON.stringify({
              success: true,
              message: "会話を終了します。短い別れの挨拶をしてください。",
            }),
          );
          return;
        }

        let result: string;

        if (functionName === "search_past_conversations") {
          const args = JSON.parse(argsJson) as {
            query: string;
            category?: QuestionCategory | null;
          };
          const searchResult = searchPastConversations(
            allRecordsRef.current,
            args,
          );
          result = JSON.stringify(searchResult);
        } else if (functionName === "get_note_entries") {
          const args = JSON.parse(argsJson) as { category: QuestionCategory };
          const noteResult = getNoteEntriesForAI(
            allRecordsRef.current,
            args.category,
          );
          result = JSON.stringify(noteResult);
        } else {
          // Delegate to voice action callbacks
          const callbacks = voiceActionRef.current;
          if (callbacks !== null) {
            const voiceResult = dispatchVoiceAction(
              callbacks,
              functionName,
              argsJson,
            );
            if (voiceResult !== null) {
              if (voiceResult instanceof Promise) {
                voiceResult
                  .then((r) => {
                    sendResult(JSON.stringify(r));
                  })
                  .catch(() => {
                    sendResult(
                      JSON.stringify({
                        error: "操作中にエラーが発生しました",
                      }),
                    );
                  });
                return;
              }
              result = JSON.stringify(voiceResult);
            } else {
              result = JSON.stringify({ error: "Unknown function" });
            }
          } else {
            result = JSON.stringify({ error: "Unknown function" });
          }
        }

        sendResult(result);
      } catch {
        sendResult(JSON.stringify({ error: "検索中にエラーが発生しました" }));
      }
    },
    [
      webrtc,
      voiceActionRef,
      clearEndConversationTimers,
      resetEndConversationFlow,
    ],
  );

  // Handle incoming data channel events
  const handleServerEvent = useCallback(
    (event: DataChannelServerEvent): void => {
      switch (event.type) {
        case "session.created":
          // Session is fully configured via the unified /v1/realtime/calls
          // FormData, so no session.update needed here. Sending a partial
          // session.update (e.g. turn_detection only) would overwrite the
          // entire audio.input object and remove the transcription config.

          dispatch({ type: "CONNECTED" });
          // Trigger AI to greet the user first
          webrtc.send({ type: "response.create" });
          break;

        case "session.updated":
          break;

        case "response.output_audio_transcript.delta":
          if (endConversationRequestedRef.current) {
            endConversationFarewellDetectedRef.current = true;
          }
          // AI is speaking — use transcript delta as a proxy for audio state
          if (!aiSpeakingRef.current) {
            aiSpeakingRef.current = true;
            dispatch({ type: "AI_SPEAKING" });
          }
          dispatch({ type: "APPEND_ASSISTANT_DELTA", delta: event.delta });
          break;

        case "response.output_audio_transcript.done":
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

          // End-conversation flow: stop only after farewell response is observed.
          if (
            endConversationRequestedRef.current &&
            endConversationFarewellDetectedRef.current
          ) {
            endConversationRequestedRef.current = false;
            endConversationFarewellDetectedRef.current = false;
            if (endConversationFallbackTimeoutRef.current !== null) {
              clearTimeout(endConversationFallbackTimeoutRef.current);
              endConversationFallbackTimeoutRef.current = null;
            }
            if (endConversationStopTimeoutRef.current !== null) {
              clearTimeout(endConversationStopTimeoutRef.current);
            }
            endConversationStopTimeoutRef.current = setTimeout(() => {
              endConversationStopTimeoutRef.current = null;
              autoEndStopTriggerRef.current = true;
              stopRef.current();
            }, END_CONVERSATION_FAREWELL_DELAY_MS);
          }
          break;
        }

        case "input_audio_buffer.speech_started":
          // Cancel pending end flow only when user actually barges in while AI is speaking.
          if (endConversationRequestedRef.current && aiSpeakingRef.current) {
            resetEndConversationFlow();
          }
          aiSpeakingRef.current = false;
          break;

        case "input_audio_buffer.speech_stopped":
          break;

        case "response.output_item.done": {
          const { item } = event;
          if (endConversationRequestedRef.current && item.type === "message") {
            endConversationFarewellDetectedRef.current = true;
          }
          if (
            item.type === "function_call" &&
            item.call_id !== undefined &&
            item.name !== undefined
          ) {
            handleFunctionCall(item.call_id, item.name, item.arguments ?? "{}");
          }
          break;
        }

        case "error":
          console.error("OpenAI Realtime API error:", {
            errorType: event.error.type,
            errorCode: event.error.code,
            errorMessage: event.error.message,
          });
          dispatch({ type: "ERROR", errorType: "aiUnavailable" });
          break;

        default:
          // Other events — no action needed
          break;
      }
    },
    [webrtc, handleFunctionCall, resetEndConversationFlow],
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

  // Start conversation — load past context, get token, connect via WebRTC
  const start = useCallback(
    (characterId: CharacterId, category: QuestionCategory | null): void => {
      conversationIdRef.current = crypto.randomUUID();
      characterIdRef.current = characterId;
      categoryRef.current = category;
      dispatch({ type: "CONNECT" });

      // Step 1: Request mic access first (must be in user gesture context for iOS)
      webrtc
        .requestMicAccess()
        .then((micStream) => {
          // Start local mic recording (for R2 upload after conversation ends)
          startLocalRecording(micStream);

          // Step 2: Load all context data in parallel
          return Promise.allSettled([
            listConversations(),
            getUserProfile(),
            listFamilyMembers(),
            listAccessPresets(),
          ]).then(
            ([recordsResult, profileResult, familyResult, presetsResult]) => {
              const allRecords =
                recordsResult.status === "fulfilled" ? recordsResult.value : [];
              if (recordsResult.status === "rejected") {
                console.error("Failed to load conversations:", {
                  error: recordsResult.reason,
                });
              }

              const profile =
                profileResult.status === "fulfilled"
                  ? profileResult.value
                  : null;
              if (profileResult.status === "rejected") {
                console.error("Failed to load user profile for session:", {
                  error: profileResult.reason,
                });
              }

              allRecordsRef.current = allRecords;

              if (category !== null) {
                // FOCUSED MODE: build context for a specific category
                const pastRecords = allRecords.filter(
                  (r) => r.category === category,
                );
                const coveredIds: string[] = [];
                const summaries: string[] = [];
                for (const record of pastRecords) {
                  if (record.coveredQuestionIds) {
                    coveredIds.push(...record.coveredQuestionIds);
                  }
                  if (record.summary) {
                    summaries.push(record.summary);
                  }
                }

                const otherCategoryRecords = allRecords
                  .filter((r) => r.category !== category && r.summary !== null)
                  .slice(0, CROSS_CATEGORY_RECORDS_LIMIT);

                const crossCategorySummaries = otherCategoryRecords.map(
                  (r) => ({
                    category:
                      QUESTION_CATEGORIES.find((c) => c.id === r.category)
                        ?.label ??
                      r.category ??
                      "",
                    summary: r.summary ?? "",
                  }),
                );

                pastContextRef.current = {
                  coveredQuestionIds: [...new Set(coveredIds)],
                  summaries: summaries.slice(0, FOCUSED_SUMMARIES_LIMIT),
                  crossCategorySummaries,
                };
                guidedContextRef.current = null;
              } else {
                // GUIDED MODE: build context across all categories
                const allCoveredIds: string[] = [];
                for (const record of allRecords) {
                  if (record.coveredQuestionIds) {
                    allCoveredIds.push(...record.coveredQuestionIds);
                  }
                }

                const recentSummaries = allRecords
                  .filter((r) => r.summary !== null)
                  .slice(0, GUIDED_RECENT_SUMMARIES_LIMIT)
                  .map((r) => ({
                    category:
                      QUESTION_CATEGORIES.find((c) => c.id === r.category)
                        ?.label ??
                      r.category ??
                      "その他",
                    summary: r.summary ?? "",
                  }));

                guidedContextRef.current = {
                  allCoveredQuestionIds: [...new Set(allCoveredIds)],
                  recentSummaries,
                };
                pastContextRef.current = null;
              }

              userNameRef.current = profile?.name ?? null;

              // Load speaking preferences from profile
              const profileSpeed = profile?.speakingSpeed;
              const profileSilence = profile?.silenceDuration;
              const profileConfirmation = profile?.confirmationLevel;
              const prefs: SpeakingPreferences = {
                speakingSpeed:
                  profileSpeed !== undefined ? profileSpeed : "normal",
                silenceDuration:
                  profileSilence !== undefined ? profileSilence : "normal",
                confirmationLevel:
                  profileConfirmation !== undefined
                    ? profileConfirmation
                    : "normal",
              };
              speakingPrefsRef.current = prefs;

              // Build family context
              const familyMembers =
                familyResult.status === "fulfilled"
                  ? familyResult.value.members
                  : [];
              if (familyResult.status === "rejected") {
                console.error("Failed to load family members for session:", {
                  error: familyResult.reason as unknown,
                });
              }
              const accessPresets =
                presetsResult.status === "fulfilled" ? presetsResult.value : [];
              if (presetsResult.status === "rejected") {
                console.error("Failed to load access presets for session:", {
                  error: presetsResult.reason as unknown,
                });
              }

              if (familyMembers.length > 0) {
                familyContextRef.current = {
                  members: familyMembers
                    .filter((m) => m.isActive)
                    .map((m) => ({
                      name: m.name,
                      relationshipLabel: m.relationshipLabel,
                    })),
                  presets: accessPresets.map((p) => ({
                    memberName: p.memberName,
                    categoryId: p.categoryId,
                  })),
                };
              } else {
                familyContextRef.current = null;
              }

              // Step 3: Build session config
              const character = getCharacterById(characterId);
              const familyCtx = familyContextRef.current ?? undefined;
              let instructions: string;
              if (category !== null) {
                instructions = buildSessionPrompt(
                  characterId,
                  category,
                  pastContextRef.current ?? undefined,
                  userNameRef.current ?? undefined,
                  prefs,
                  familyCtx,
                );
              } else {
                instructions = buildGuidedSessionPrompt(
                  characterId,
                  guidedContextRef.current ?? {
                    allCoveredQuestionIds: [],
                    recentSummaries: [],
                  },
                  userNameRef.current ?? undefined,
                  prefs,
                  familyCtx,
                );
              }

              const silenceDurationMs =
                SILENCE_DURATION_MS_MAP[prefs.silenceDuration];

              const turnDetection = {
                ...SESSION_CONFIG.turn_detection,
                silence_duration_ms: silenceDurationMs,
              };
              turnDetectionRef.current = turnDetection;

              const sessionConfig = {
                instructions,
                voice: character.voice,
                tools: [...REALTIME_TOOLS],
                turn_detection: turnDetection,
              };

              // Step 4: Connect WebRTC — server handles SDP exchange
              return webrtc.connect(
                micStream,
                async (offerSdp: string): Promise<string> => {
                  const result = await connectRealtimeSession(
                    sessionConfig,
                    offerSdp,
                  );
                  sessionKeyRef.current = result.sessionKey;
                  return result.answerSdp;
                },
              );
            },
          );
        })
        .catch((err: unknown) => {
          discardLocalRecording();
          console.error("Failed to start conversation:", { error: err });
          // Determine error type based on failure
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

      // Start session timer
      sessionStartTimeRef.current = Date.now();
      dispatch({ type: "TICK_TIMER", remainingMs: MAX_SESSION_DURATION_MS });
      sessionTimerRef.current = setInterval(() => {
        const startTime = sessionStartTimeRef.current;
        if (startTime === null) return;
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, MAX_SESSION_DURATION_MS - elapsed);
        dispatch({ type: "TICK_TIMER", remainingMs: remaining });

        // Show warning when threshold is reached
        const warningThreshold =
          MAX_SESSION_DURATION_MS * SESSION_WARNING_THRESHOLD;
        if (elapsed >= warningThreshold) {
          dispatch({ type: "SESSION_WARNING_SHOWN" });
        }

        // Auto-stop when time is up
        if (remaining <= 0) {
          stopRef.current();
        }
      }, TIMER_INTERVAL_MS);
    },
    [webrtc, startLocalRecording, discardLocalRecording],
  );

  // Stop conversation, save transcript, and request summary
  const stop = useCallback((): void => {
    const shouldEmitAutoEndSignal = autoEndStopTriggerRef.current;
    autoEndStopTriggerRef.current = false;

    // Clear session timer
    if (sessionTimerRef.current !== null) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    sessionStartTimeRef.current = null;

    // Reset end-conversation state
    resetEndConversationFlow();
    aiSpeakingRef.current = false;

    const currentTranscript = transcriptRef.current;
    const convId = conversationIdRef.current;
    const category = categoryRef.current;
    const charId = characterIdRef.current;
    const recordingPromise = stopLocalRecording();

    if (convId !== null && currentTranscript.length > 0) {
      const firstEntry = currentTranscript[0];
      const record = {
        id: convId,
        category,
        characterId: charId,
        startedAt: firstEntry !== undefined ? firstEntry.timestamp : Date.now(),
        endedAt: Date.now(),
        transcript: [...currentTranscript],
        summary: null,
        summaryStatus: "pending" as const,
        audioAvailable: false,
      };

      // Save immediately with pending status
      dispatch({ type: "SUMMARY_PENDING" });

      // Gather previous note entries for change-aware summarization
      const previousEntries = collectCurrentNoteEntries(
        allRecordsRef.current,
        category,
      );

      saveConversation(record)
        .then(async () => {
          // Upload audio first so enhanced summarization can use re-transcription.
          const recordedAudio = await recordingPromise;
          if (recordedAudio !== null) {
            try {
              const uploadResult = await saveAudioRecording(
                convId,
                recordedAudio.blob,
                recordedAudio.mimeType,
              );
              if (uploadResult !== null) {
                const audioHash = await computeBlobHash(recordedAudio.blob);
                await updateConversation(convId, {
                  audioAvailable: true,
                  audioStorageKey: uploadResult.storageKey,
                  audioMimeType: recordedAudio.mimeType,
                  audioHash,
                });
              }
            } catch (audioError: unknown) {
              console.error("Failed to save conversation audio:", {
                error: audioError,
              });
            }
          }

          const summarizePromise = requestEnhancedSummarize(
            convId,
            category,
            previousEntries,
          ).catch(() => {
            return requestSummarize(
              category,
              record.transcript,
              previousEntries,
            );
          });

          return summarizePromise
            .then((result) => {
              if (
                result.extractedUserName !== undefined &&
                result.extractedUserName !== null &&
                result.extractedUserName !== ""
              ) {
                getUserProfile()
                  .then((currentProfile) =>
                    saveUserProfile({
                      name: result.extractedUserName ?? "",
                      characterId: currentProfile?.characterId,
                      updatedAt: Date.now(),
                    }),
                  )
                  .catch(() => {});
              }

              return updateConversation(convId, {
                summary: result.summary,
                coveredQuestionIds: result.coveredQuestionIds,
                noteEntries: result.noteEntries,
                summaryStatus: "completed",
                oneLinerSummary: result.oneLinerSummary,
                emotionAnalysis: result.emotionAnalysis,
                discussedCategories:
                  result.discussedCategories as QuestionCategory[],
                keyPoints: result.keyPoints,
                topicAdherence: result.topicAdherence,
                offTopicSummary: result.offTopicSummary,
              });
            })
            .then(() => {
              return getConversation(convId).then((fullRecord) => {
                if (fullRecord !== null) {
                  return computeContentHash(fullRecord).then((integrityHash) =>
                    updateConversation(convId, {
                      integrityHash,
                      integrityHashedAt: Date.now(),
                    }),
                  );
                }
              });
            })
            .then(() => {
              dispatch({ type: "SUMMARY_COMPLETED" });
            });
        })
        .catch((error: unknown) => {
          console.error("Failed to save/summarize conversation:", error);
          updateConversation(convId, { summaryStatus: "failed" }).catch(
            () => {},
          );
          dispatch({ type: "SUMMARY_FAILED" });
        });
    }

    webrtc.disconnect();
    dispatch({ type: "DISCONNECT" });

    // End server-side session tracking
    const key = sessionKeyRef.current;
    if (key !== "") {
      endRealtimeSession(key).catch((err: unknown) => {
        console.error("Failed to end realtime session:", { error: err });
      });
    }

    conversationIdRef.current = null;
    characterIdRef.current = null;
    categoryRef.current = null;
    pastContextRef.current = null;
    guidedContextRef.current = null;
    userNameRef.current = null;
    allRecordsRef.current = [];
    familyContextRef.current = null;
    sessionKeyRef.current = "";
    speakingPrefsRef.current = {
      speakingSpeed: "normal",
      silenceDuration: "normal",
      confirmationLevel: "normal",
    };

    if (shouldEmitAutoEndSignal) {
      setAutoEndSignal((n) => n + 1);
    }
  }, [webrtc, stopLocalRecording, resetEndConversationFlow]);

  // Keep stopRef in sync with the latest stop callback
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Clean up session timer on unmount
  useEffect(() => {
    return () => {
      if (sessionTimerRef.current !== null) {
        clearInterval(sessionTimerRef.current);
      }
      autoEndStopTriggerRef.current = false;
      resetEndConversationFlow();
      discardLocalRecording();
    };
  }, [discardLocalRecording, resetEndConversationFlow]);

  // Mid-conversation session config update is not supported with WebRTC GA protocol
  // (session is pre-configured via client_secrets). Changes will apply to the next session.
  const updateSessionConfig = useCallback(
    (preferences: SpeakingPreferences): void => {
      speakingPrefsRef.current = preferences;
    },
    [],
  );

  // Retry after error
  const retry = useCallback((): void => {
    const retryCharacterId = characterIdRef.current;
    const retryCategory = categoryRef.current;
    stop();
    setTimeout(() => {
      if (retryCharacterId !== null) {
        start(retryCharacterId, retryCategory);
      }
    }, RETRY_DELAY_MS);
  }, [stop, start]);

  return {
    state: state.conversationState,
    errorType: state.errorType,
    transcript: state.transcript,
    pendingAssistantText: state.pendingAssistantText,
    audioLevel: webrtc.audioLevel,
    characterId: characterIdRef.current,
    summaryStatus: state.summaryStatus,
    remainingMs: state.remainingMs,
    sessionWarningShown: state.sessionWarningShown,
    autoEndSignal,
    start,
    stop,
    retry,
    updateSessionConfig,
  };
}
