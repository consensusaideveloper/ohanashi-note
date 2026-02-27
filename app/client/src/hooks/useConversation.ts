import { useCallback, useEffect, useRef, useReducer } from "react";

import {
  SESSION_CONFIG,
  REALTIME_TOOLS,
  CROSS_CATEGORY_RECORDS_LIMIT,
  FOCUSED_SUMMARIES_LIMIT,
  GUIDED_RECENT_SUMMARIES_LIMIT,
  RETRY_DELAY_MS,
  MAX_SESSION_DURATION_MS,
  SESSION_WARNING_THRESHOLD,
  POST_SPEECH_COOLDOWN_MS,
  MIN_TRANSCRIPT_LENGTH,
  BARGE_IN_RMS_THRESHOLD,
  BARGE_IN_CONSECUTIVE_CHUNKS,
} from "../lib/constants";
import { getCharacterById } from "../lib/characters";
import {
  buildSessionPrompt,
  buildGuidedSessionPrompt,
} from "../lib/prompt-builder";
import {
  saveConversation,
  updateConversation,
  saveAudioRecording,
  listConversations,
  getConversation,
  getUserProfile,
  saveUserProfile,
} from "../lib/storage";
import { computeContentHash, computeBlobHash } from "../lib/integrity";
import { QUESTION_CATEGORIES, getQuestionsByCategory } from "../lib/questions";
import { requestSummarize, requestEnhancedSummarize } from "../lib/api";
import {
  searchPastConversations,
  getNoteEntriesForAI,
} from "../lib/conversation-search";
import { useVoiceActionRef } from "../contexts/VoiceActionContext";

import type { VoiceActionCallbacks } from "../contexts/VoiceActionContext";
import { useWebSocket } from "./useWebSocket";
import { useAudioInput } from "./useAudioInput";
import { useAudioOutput } from "./useAudioOutput";

import type {
  PastConversationContext,
  GuidedPastContext,
} from "../lib/prompt-builder";
import type { ServerEvent } from "../lib/websocket-protocol";
import type {
  CharacterId,
  ConversationRecord,
  ConversationState,
  ErrorType,
  NoteEntry,
  QuestionCategory,
  TranscriptEntry,
  VoiceActionResult,
} from "../types/conversation";

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
  /** Start a conversation. Pass null for category to use AI-guided mode. */
  start: (characterId: CharacterId, category: QuestionCategory | null) => void;
  /** Stop the conversation and disconnect. */
  stop: () => void;
  /** Retry after an error. */
  retry: () => void;
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

export function useConversation(): UseConversationReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  const ws = useWebSocket();
  const audioOutput = useAudioOutput();
  const voiceActionRef = useVoiceActionRef();

  // Track whether we've sent the session.update to avoid sending it twice
  const sessionConfigSentRef = useRef(false);

  // Session timer refs
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);

  const TIMER_INTERVAL_MS = 1000;

  // Conversation persistence refs
  const conversationIdRef = useRef<string | null>(null);
  const characterIdRef = useRef<CharacterId | null>(null);
  const categoryRef = useRef<QuestionCategory | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  // Past conversation context (loaded on start, used in session.created)
  const pastContextRef = useRef<PastConversationContext | null>(null);

  // Guided mode context (loaded on start when category is null)
  const guidedContextRef = useRef<GuidedPastContext | null>(null);

  // User name (loaded on start, used in session.created)
  const userNameRef = useRef<string | null>(null);

  // All conversation records (loaded on start, used for function call search)
  const allRecordsRef = useRef<ConversationRecord[]>([]);

  // Echo suppression: gate audio input to server during AI speech + cooldown
  const audioGatedRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bargeInCountRef = useRef(0);

  // Stable ref for stop so the session timer can call it without stale closures
  const stopRef = useRef<() => void>(() => {});

  // Keep transcript ref in sync with reducer state
  useEffect(() => {
    transcriptRef.current = state.transcript;
  }, [state.transcript]);

  /** Cancel any pending post-speech cooldown timer. */
  const clearCooldownTimer = useCallback((): void => {
    if (cooldownTimerRef.current !== null) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  // Callback for audio chunks from the microphone
  const handleAudioChunk = useCallback(
    (base64: string, rmsLevel: number): void => {
      if (audioGatedRef.current) {
        // Check for barge-in: user speaking loudly enough to override echo
        if (rmsLevel >= BARGE_IN_RMS_THRESHOLD) {
          bargeInCountRef.current += 1;
          if (bargeInCountRef.current >= BARGE_IN_CONSECUTIVE_CHUNKS) {
            // Confirmed barge-in — ungate and stop AI playback
            audioGatedRef.current = false;
            bargeInCountRef.current = 0;
            clearCooldownTimer();
            audioOutput.stopPlayback();
            ws.send({ type: "input_audio_buffer.clear" });
            // Fall through to send this chunk
          } else {
            return; // Not yet confirmed
          }
        } else {
          bargeInCountRef.current = 0;
          return; // Below threshold — skip (echo or noise)
        }
      }
      ws.send({
        type: "input_audio_buffer.append",
        audio: base64,
      });
    },
    [ws, audioOutput, clearCooldownTimer],
  );

  const audioInput = useAudioInput({ onAudioChunk: handleAudioChunk });

  // Handle function calls from the Realtime API
  const handleFunctionCall = useCallback(
    (callId: string, functionName: string, argsJson: string): void => {
      /** Send function call output back to the Realtime API and trigger a response. */
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
          // Delegate to voice action callbacks (tools added in Phase B-D)
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
    [ws, voiceActionRef],
  );

  // Handle incoming server events
  const handleServerEvent = useCallback(
    (event: ServerEvent): void => {
      switch (event.type) {
        case "session.created":
        case "session.updated":
          // Session is ready — if we haven't sent config yet, send it
          if (
            event.type === "session.created" &&
            !sessionConfigSentRef.current
          ) {
            sessionConfigSentRef.current = true;
            const charId = characterIdRef.current ?? "character-a";
            const character = getCharacterById(charId);
            let instructions: string;
            if (categoryRef.current !== null) {
              // Focused mode: category-specific prompt
              instructions = buildSessionPrompt(
                charId,
                categoryRef.current,
                pastContextRef.current ?? undefined,
                userNameRef.current ?? undefined,
              );
            } else {
              // Guided mode: cross-category prompt
              instructions = buildGuidedSessionPrompt(
                charId,
                guidedContextRef.current ?? {
                  allCoveredQuestionIds: [],
                  recentSummaries: [],
                },
                userNameRef.current ?? undefined,
              );
            }
            ws.send({
              type: "session.update",
              session: {
                ...SESSION_CONFIG,
                voice: character.voice,
                instructions,
                tools: [...REALTIME_TOOLS],
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
          // AI is sending audio — gate mic input and transition to speaking state
          if (state.conversationState !== "ai-speaking") {
            dispatch({ type: "AI_SPEAKING" });
            // Clear any audio already buffered server-side to prevent stale echo
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
          if (trimmed.length >= MIN_TRANSCRIPT_LENGTH) {
            dispatch({ type: "ADD_USER_TRANSCRIPT", text: trimmed });
          }
          break;
        }

        case "response.done":
          dispatch({ type: "AI_DONE" });
          // Start post-speech cooldown: keep audio gated briefly
          // to prevent residual echo from triggering a new response
          clearCooldownTimer();
          cooldownTimerRef.current = setTimeout(() => {
            audioGatedRef.current = false;
            cooldownTimerRef.current = null;
          }, POST_SPEECH_COOLDOWN_MS);
          break;

        case "input_audio_buffer.speech_started":
          // User started speaking — stop any AI audio that's playing
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
          dispatch({ type: "ERROR", errorType: "aiUnavailable" });
          break;

        default:
          // Other events — no action needed
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

  // Watch for WebSocket connection failures and server rejection codes
  useEffect(() => {
    if (ws.status === "failed") {
      if (ws.lastError === "QUOTA_EXCEEDED") {
        dispatch({ type: "ERROR", errorType: "quotaExceeded" });
      } else if (ws.lastError === "SESSION_TIMEOUT") {
        // Server forced timeout — trigger normal stop flow to save data
        stopRef.current();
      } else {
        dispatch({ type: "ERROR", errorType: "network" });
      }
    }
  }, [ws.status, ws.lastError]);

  // Start conversation — load past context, then connect
  const start = useCallback(
    (characterId: CharacterId, category: QuestionCategory | null): void => {
      conversationIdRef.current = crypto.randomUUID();
      characterIdRef.current = characterId;
      categoryRef.current = category;
      dispatch({ type: "CONNECT" });
      sessionConfigSentRef.current = false;

      // Load all conversations and user profile
      Promise.all([listConversations(), getUserProfile()])
        .then(([allRecords, profile]) => {
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

            const crossCategorySummaries = otherCategoryRecords.map((r) => ({
              category:
                QUESTION_CATEGORIES.find((c) => c.id === r.category)?.label ??
                r.category ??
                "",
              summary: r.summary ?? "",
            }));

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
                  QUESTION_CATEGORIES.find((c) => c.id === r.category)?.label ??
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
        })
        .catch(() => {
          pastContextRef.current = null;
          guidedContextRef.current = null;
          userNameRef.current = null;
        })
        .finally(() => {
          ws.connect();
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

      // Start audio capture (must be in user gesture handler context)
      audioInput.startCapture().catch(() => {
        dispatch({ type: "ERROR", errorType: "microphone" });
      });
    },
    [ws, audioInput],
  );

  // Stop conversation, save transcript, recording, and request summary
  const stop = useCallback((): void => {
    // Clear session timer
    if (sessionTimerRef.current !== null) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    sessionStartTimeRef.current = null;

    // Reset echo suppression state
    clearCooldownTimer();
    audioGatedRef.current = false;
    bargeInCountRef.current = 0;

    const currentTranscript = transcriptRef.current;
    const convId = conversationIdRef.current;
    const category = categoryRef.current;
    const charId = characterIdRef.current;

    // Stop audio capture and get the recording blob asynchronously
    const audioBlobPromise = audioInput.stopCaptureWithRecording();

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
        .then(() => {
          // After conversation is saved, start audio processing
          return audioBlobPromise.then((audioBlob) => {
            if (audioBlob !== null && audioBlob.size > 0) {
              return computeBlobHash(audioBlob).then((audioHash) =>
                saveAudioRecording(convId, audioBlob, audioBlob.type).then(
                  (result) => {
                    // Use atomic update to avoid overwriting summary
                    const audioUpdate: Partial<ConversationRecord> = {
                      audioAvailable: true,
                      audioHash,
                    };
                    // Include storage key if R2 upload succeeded
                    if (result !== null) {
                      audioUpdate.audioStorageKey = result.storageKey;
                      audioUpdate.audioMimeType = audioBlob.type;
                    }
                    return updateConversation(convId, audioUpdate);
                  },
                ),
              );
            } else {
              return Promise.resolve();
            }
          });
        })
        .then(() => {
          // Request enhanced summarization (re-transcription + summarize on server).
          // Falls back to client-side summarize if enhanced endpoint fails.
          const summarizePromise = requestEnhancedSummarize(
            convId,
            category,
            previousEntries,
          ).catch(() => {
            // Fallback: use original realtime transcript for summarization
            return requestSummarize(
              category,
              record.transcript,
              previousEntries,
            );
          });

          return summarizePromise
            .then((result) => {
              // Auto-save extracted user name to profile
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

              // Update local IndexedDB with summary results
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
              // Compute integrity hash on the finalized record
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
          // Mark summary as failed but keep the transcript saved
          updateConversation(convId, { summaryStatus: "failed" }).catch(
            () => {},
          );
          dispatch({ type: "SUMMARY_FAILED" });
        });
    }

    audioOutput.stopPlayback();
    ws.disconnect();
    dispatch({ type: "DISCONNECT" });

    conversationIdRef.current = null;
    characterIdRef.current = null;
    categoryRef.current = null;
    pastContextRef.current = null;
    guidedContextRef.current = null;
    userNameRef.current = null;
    allRecordsRef.current = [];
  }, [ws, audioInput, audioOutput, clearCooldownTimer]);

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
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  // Retry after error
  const retry = useCallback((): void => {
    const retryCharacterId = characterIdRef.current;
    const retryCategory = categoryRef.current;
    stop();
    // Small delay to ensure cleanup before reconnecting
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
    audioLevel: audioInput.audioLevel,
    characterId: characterIdRef.current,
    summaryStatus: state.summaryStatus,
    remainingMs: state.remainingMs,
    sessionWarningShown: state.sessionWarningShown,
    start,
    stop,
    retry,
  };
}
