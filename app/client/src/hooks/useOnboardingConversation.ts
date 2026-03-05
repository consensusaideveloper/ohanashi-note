// Lightweight conversation hook for the onboarding flow.
// Based on useConversation but without session persistence, summarization,
// session limits, or VoiceActionContext dependency.

import { useCallback, useEffect, useRef, useReducer } from "react";

import {
  SESSION_CONFIG,
  ONBOARDING_TOOLS,
  FONT_SIZE_LABELS,
  SPEAKING_SPEED_LABELS,
  SILENCE_DURATION_LABELS,
  CONFIRMATION_LEVEL_LABELS,
  RETRY_DELAY_MS,
  SESSION_AUDIO_INPUT_CONFIG,
  DEFAULT_SPEAKING_SPEED,
  DEFAULT_SILENCE_DURATION,
  DEFAULT_CONFIRMATION_LEVEL,
  SILENCE_DURATION_MS_MAP,
} from "../lib/constants";
import { getAcceptedUserTranscript } from "../lib/audio";
import { getCharacterById } from "../lib/characters";
import { computeContentHash } from "../lib/integrity";
import {
  hasExplicitConversationEndIntent,
  hasOnboardingCompletionSignal,
} from "../lib/conversation-end";
import { buildOnboardingPrompt } from "../lib/prompt-builder";
import {
  getConversation,
  getUserProfile,
  listConversations,
  saveConversation,
  saveUserProfile,
  updateConversation,
} from "../lib/storage";
import {
  connectRealtimeSession,
  endRealtimeSession,
  requestSummarize,
} from "../lib/api";
import { useWebRTC } from "./useWebRTC";

import type { DataChannelServerEvent } from "../lib/realtime-protocol";
import type {
  CharacterId,
  ConfirmationLevel,
  ConversationState,
  ConversationRecord,
  ErrorType,
  FontSizeLevel,
  NoteEntry,
  QuestionCategory,
  SilenceDuration,
  SpeakingPreferences,
  SpeakingSpeed,
  TranscriptEntry,
  UserProfile,
} from "../types/conversation";

// --- End-conversation flow ---
const END_CONVERSATION_FAREWELL_DELAY_MS = 6000;
const END_CONVERSATION_FALLBACK_MS = 12000;
const PROFILE_SAVE_WAIT_TIMEOUT_MS = 3000;

/** Delay (ms) after AI finishes speaking before re-enabling the mic. */
const MIC_REENABLE_DELAY_MS = 300;

const DEFAULT_SPEAKING_PREFERENCES: SpeakingPreferences = {
  speakingSpeed: DEFAULT_SPEAKING_SPEED,
  silenceDuration: DEFAULT_SILENCE_DURATION,
  confirmationLevel: DEFAULT_CONFIRMATION_LEVEL,
};

function getProfileSpeakingPreferences(
  profile: UserProfile | null,
): SpeakingPreferences {
  return {
    speakingSpeed: profile?.speakingSpeed ?? DEFAULT_SPEAKING_SPEED,
    silenceDuration: profile?.silenceDuration ?? DEFAULT_SILENCE_DURATION,
    confirmationLevel: profile?.confirmationLevel ?? DEFAULT_CONFIRMATION_LEVEL,
  };
}

function collectCurrentNoteEntries(
  records: readonly ConversationRecord[],
): NoteEntry[] {
  if (records.length === 0) return [];

  const entryMap = new Map<string, NoteEntry>();
  const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);

  for (const record of sorted) {
    if (record.noteEntries === undefined) continue;
    for (const entry of record.noteEntries) {
      entryMap.set(entry.questionId, entry);
    }
  }

  return Array.from(entryMap.values());
}

function shouldPersistOnboardingConversation(result: {
  noteEntries: NoteEntry[];
  discussedCategories: string[];
  topicAdherence: "high" | "medium" | "low";
}): boolean {
  return (
    result.noteEntries.length > 0 ||
    result.discussedCategories.length > 0 ||
    result.topicAdherence !== "low"
  );
}

function normalizePreferenceToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[「」『』"'`]/g, "");
}

function normalizeCharacterId(value: string): CharacterId | null {
  const normalized = normalizePreferenceToken(value);
  if (normalized === "") return null;

  const map: Record<string, CharacterId> = {
    "character-a": "character-a",
    charactera: "character-a",
    a: "character-a",
    のんびり: "character-a",
    "character-b": "character-b",
    characterb: "character-b",
    b: "character-b",
    しっかり: "character-b",
    "character-c": "character-c",
    characterc: "character-c",
    c: "character-c",
    にこにこ: "character-c",
  };
  const direct = map[normalized];
  if (direct !== undefined) return direct;

  if (normalized.includes("のんびり")) return "character-a";
  if (normalized.includes("しっかり")) return "character-b";
  if (normalized.includes("にこにこ")) return "character-c";
  return null;
}

function normalizeFontSizeLevel(value: string): FontSizeLevel | null {
  const normalized = normalizePreferenceToken(value);
  if (normalized === "") return null;
  if (
    normalized === "x-large" ||
    normalized === "xlarge" ||
    normalized === "特大" ||
    normalized === "とても大きい"
  ) {
    return "x-large";
  }
  if (normalized === "large" || normalized === "大きめ") {
    return "large";
  }
  if (
    normalized === "standard" ||
    normalized === "標準" ||
    normalized === "ふつう" ||
    normalized === "普通"
  ) {
    return "standard";
  }
  return null;
}

function normalizeSpeakingSpeed(value: string): SpeakingSpeed | null {
  const normalized = normalizePreferenceToken(value);
  if (normalized === "") return null;
  const map: Record<string, SpeakingSpeed> = {
    slow: "slow",
    ゆっくり: "slow",
    ゆっくりめ: "slow",
    遅め: "slow",
    のんびり: "slow",
    normal: "normal",
    ふつう: "normal",
    普通: "normal",
    そのまま: "normal",
    今のまま: "normal",
    fast: "fast",
    速め: "fast",
    すこし速め: "fast",
    少し速め: "fast",
    テキパキ: "fast",
  };
  const direct = map[normalized];
  if (direct !== undefined) return direct;
  if (normalized.includes("ゆっくり") || normalized.includes("遅")) {
    return "slow";
  }
  if (normalized.includes("速")) {
    return "fast";
  }
  if (normalized.includes("そのまま") || normalized.includes("ふつう")) {
    return "normal";
  }
  return null;
}

function normalizeSilenceDuration(value: string): SilenceDuration | null {
  const normalized = normalizePreferenceToken(value);
  if (normalized === "") return null;
  const map: Record<string, SilenceDuration> = {
    short: "short",
    短め: "short",
    短い: "short",
    すぐ: "short",
    normal: "normal",
    ふつう: "normal",
    普通: "normal",
    そのまま: "normal",
    今のまま: "normal",
    long: "long",
    長め: "long",
    長い: "long",
  };
  const direct = map[normalized];
  if (direct !== undefined) return direct;
  if (normalized.includes("短") || normalized.includes("すぐ")) {
    return "short";
  }
  if (normalized.includes("長")) {
    return "long";
  }
  if (normalized.includes("そのまま") || normalized.includes("ふつう")) {
    return "normal";
  }
  return null;
}

function normalizeConfirmationLevel(value: string): ConfirmationLevel | null {
  const normalized = normalizePreferenceToken(value);
  if (normalized === "") return null;
  const map: Record<string, ConfirmationLevel> = {
    frequent: "frequent",
    こまめに確認: "frequent",
    しっかり確認: "frequent",
    確認多め: "frequent",
    normal: "normal",
    ふつう: "normal",
    普通: "normal",
    そのまま: "normal",
    今のまま: "normal",
    minimal: "minimal",
    あまり確認しない: "minimal",
    確認少なめ: "minimal",
    どんどん進める: "minimal",
  };
  const direct = map[normalized];
  if (direct !== undefined) return direct;
  if (normalized.includes("こまめ") || normalized.includes("しっかり確認")) {
    return "frequent";
  }
  if (normalized.includes("あまり確認") || normalized.includes("確認少")) {
    return "minimal";
  }
  if (normalized.includes("そのまま") || normalized.includes("ふつう")) {
    return "normal";
  }
  return null;
}

// --- State machine ---

interface State {
  conversationState: ConversationState;
  errorType: ErrorType | null;
  transcript: TranscriptEntry[];
  pendingAssistantText: string;
  characterId: CharacterId;
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
  | { type: "FINALIZE_ASSISTANT_TRANSCRIPT"; text: string }
  | { type: "SET_CHARACTER"; characterId: CharacterId };

const DEFAULT_CHARACTER_ID: CharacterId = "character-a";

const initialState: State = {
  conversationState: "idle",
  errorType: null,
  transcript: [],
  pendingAssistantText: "",
  characterId: DEFAULT_CHARACTER_ID,
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
    case "SET_CHARACTER":
      return { ...state, characterId: action.characterId };
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
  remoteAudioLevel: number;
  characterId: CharacterId;
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

  // End-conversation flow refs
  const endConversationRequestedRef = useRef(false);
  const endConversationFarewellDetectedRef = useRef(false);
  const endConversationStopTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const endConversationFallbackTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const stopAfterAudioScheduledRef = useRef(false);
  const audioEndUnsubscribeRef = useRef<(() => void) | null>(null);

  // Session key for server-side tracking
  const sessionKeyRef = useRef<string>("");
  const speakingPrefsRef = useRef<SpeakingPreferences>(
    DEFAULT_SPEAKING_PREFERENCES,
  );

  // Track whether AI is currently speaking (for UI state)
  const aiSpeakingRef = useRef(false);

  const micReenableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const micGuardActiveRef = useRef(false);
  const ignoreUserTranscriptsUntilRef = useRef(0);
  const ignoredInputItemIdsRef = useRef<Set<string>>(new Set());
  const pendingProfileSavesRef = useRef<Set<Promise<void>>>(new Set());

  // Stable ref for stop
  const stopRef = useRef<() => void>(() => {});
  const cleanupRealtimeSessionRef = useRef<() => void>(() => {});

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
    stopAfterAudioScheduledRef.current = false;
    if (audioEndUnsubscribeRef.current !== null) {
      audioEndUnsubscribeRef.current();
      audioEndUnsubscribeRef.current = null;
    }
    clearEndConversationTimers();
  }, [clearEndConversationTimers]);

  const releaseMicGuardNow = useCallback((): void => {
    if (micReenableTimerRef.current !== null) {
      clearTimeout(micReenableTimerRef.current);
      micReenableTimerRef.current = null;
    }
    micGuardActiveRef.current = false;
    ignoreUserTranscriptsUntilRef.current = 0;
    webrtc.setMicEnabled(true);
  }, [webrtc]);

  const engageMicGuard = useCallback((): void => {
    if (micReenableTimerRef.current !== null) {
      clearTimeout(micReenableTimerRef.current);
      micReenableTimerRef.current = null;
    }
    micGuardActiveRef.current = true;
    webrtc.setMicEnabled(false);
  }, [webrtc]);

  const scheduleMicGuardRelease = useCallback((): void => {
    if (micReenableTimerRef.current !== null) {
      clearTimeout(micReenableTimerRef.current);
    }
    micGuardActiveRef.current = true;
    ignoreUserTranscriptsUntilRef.current = Date.now() + MIC_REENABLE_DELAY_MS;
    micReenableTimerRef.current = setTimeout(() => {
      micReenableTimerRef.current = null;
      micGuardActiveRef.current = false;
      ignoreUserTranscriptsUntilRef.current = 0;
      webrtc.setMicEnabled(true);
    }, MIC_REENABLE_DELAY_MS);
  }, [webrtc]);

  const resetMicGuard = useCallback((): void => {
    if (micReenableTimerRef.current !== null) {
      clearTimeout(micReenableTimerRef.current);
      micReenableTimerRef.current = null;
    }
    micGuardActiveRef.current = false;
    ignoreUserTranscriptsUntilRef.current = 0;
    ignoredInputItemIdsRef.current.clear();
  }, []);

  const cleanupRealtimeSession = useCallback((): void => {
    resetEndConversationFlow();
    aiSpeakingRef.current = false;
    resetMicGuard();
    speakingPrefsRef.current = DEFAULT_SPEAKING_PREFERENCES;
    webrtc.disconnect();

    const key = sessionKeyRef.current;
    if (key !== "") {
      sessionKeyRef.current = "";
      endRealtimeSession(key).catch((err: unknown) => {
        console.error(
          "Failed to end onboarding realtime session after error:",
          {
            error: err,
          },
        );
      });
    }
  }, [webrtc, resetEndConversationFlow, resetMicGuard]);

  useEffect(() => {
    cleanupRealtimeSessionRef.current = cleanupRealtimeSession;
  }, [cleanupRealtimeSession]);

  const enqueueProfileSave = useCallback(
    (updates: Partial<UserProfile>): Promise<void> => {
      const savePromise = saveUserProfile({
        ...updates,
        updatedAt: Date.now(),
      });
      pendingProfileSavesRef.current.add(savePromise);
      return savePromise.finally(() => {
        pendingProfileSavesRef.current.delete(savePromise);
      });
    },
    [],
  );

  const waitForPendingProfileSaves = useCallback(async (): Promise<void> => {
    const pending = Array.from(pendingProfileSavesRef.current);
    if (pending.length === 0) {
      return;
    }
    await Promise.race([
      Promise.allSettled(pending).then(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, PROFILE_SAVE_WAIT_TIMEOUT_MS);
      }),
    ]);
  }, []);

  const persistOnboardingConversation = useCallback(
    (
      transcript: readonly TranscriptEntry[],
      characterId: CharacterId,
    ): void => {
      const hasUserContent = transcript.some(
        (entry) => entry.role === "user" && entry.text.trim().length > 0,
      );
      if (!hasUserContent || transcript.length === 0) {
        return;
      }

      const firstEntry = transcript[0];
      const conversationId = crypto.randomUUID();
      const recordTranscript = [...transcript];
      const startedAt =
        firstEntry !== undefined ? firstEntry.timestamp : Date.now();
      const endedAt = Date.now();

      listConversations()
        .then((records) => {
          const previousEntries = collectCurrentNoteEntries(records);
          return requestSummarize(null, recordTranscript, previousEntries);
        })
        .then(async (result) => {
          if (!shouldPersistOnboardingConversation(result)) {
            return;
          }

          const record: ConversationRecord = {
            id: conversationId,
            category: null,
            characterId,
            startedAt,
            endedAt,
            transcript: recordTranscript,
            summary: result.summary,
            coveredQuestionIds: result.coveredQuestionIds,
            noteEntries: result.noteEntries,
            summaryStatus: "completed",
            oneLinerSummary: result.oneLinerSummary,
            discussedCategories:
              result.discussedCategories as QuestionCategory[],
            keyPoints: result.keyPoints,
            topicAdherence: result.topicAdherence,
            offTopicSummary: result.offTopicSummary,
            audioAvailable: false,
          };

          await saveConversation(record);

          const fullRecord = await getConversation(conversationId);
          const integrityHash = await computeContentHash(fullRecord ?? record);
          await updateConversation(conversationId, {
            integrityHash,
            integrityHashedAt: Date.now(),
          });

          if (
            result.extractedUserName !== undefined &&
            result.extractedUserName !== null &&
            result.extractedUserName !== ""
          ) {
            const currentProfile = await getUserProfile();
            await saveUserProfile({
              name: result.extractedUserName,
              characterId: currentProfile?.characterId,
              updatedAt: Date.now(),
            });
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to persist onboarding conversation:", {
            error,
          });
        });
    },
    [],
  );

  const applySpeakingPreferencesToSession = useCallback(
    (preferences: SpeakingPreferences): void => {
      speakingPrefsRef.current = preferences;
      webrtc.send({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: buildOnboardingPrompt(preferences),
          audio: {
            input: {
              ...SESSION_AUDIO_INPUT_CONFIG,
              turn_detection: {
                ...SESSION_CONFIG.turn_detection,
                silence_duration_ms:
                  SILENCE_DURATION_MS_MAP[preferences.silenceDuration],
              },
            },
          },
        },
      });
    },
    [webrtc],
  );

  const requestEndConversation = useCallback(
    (source: "tool" | "user_intent" | "completion_signal"): void => {
      if (endConversationRequestedRef.current) {
        if (source !== "tool") {
          endConversationFarewellDetectedRef.current = true;
        }
        return;
      }

      endConversationRequestedRef.current = true;
      endConversationFarewellDetectedRef.current = source !== "tool";
      clearEndConversationTimers();
      endConversationFallbackTimeoutRef.current = setTimeout(() => {
        resetEndConversationFlow();
        stopRef.current();
      }, END_CONVERSATION_FALLBACK_MS);
    },
    [clearEndConversationTimers, resetEndConversationFlow],
  );

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
          requestEndConversation("tool");

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
          if (trimmedName === "") {
            sendResult(
              JSON.stringify({
                error: "お名前が空欄です。もう一度教えてください。",
              }),
            );
            return;
          }
          void enqueueProfileSave({
            name: trimmedName,
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
          const args = JSON.parse(argsJson) as {
            character_name?: string;
            characterName?: string;
            character_id?: string;
            characterId?: string;
          };
          const rawCharacter =
            args.character_name ??
            args.characterName ??
            args.character_id ??
            args.characterId ??
            "";
          const normalizedId = normalizeCharacterId(rawCharacter);
          if (normalizedId === null) {
            sendResult(
              JSON.stringify({
                error: `「${rawCharacter}」というキャラクターは見つかりません`,
              }),
            );
            return;
          }
          const character = getCharacterById(normalizedId);
          dispatch({ type: "SET_CHARACTER", characterId: character.id });
          void enqueueProfileSave({
            characterId: character.id,
          })
            .then(() => {
              sendResult(
                JSON.stringify({
                  success: true,
                  message: `話し相手を「${character.name}」に変更しました`,
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
          const level = normalizeFontSizeLevel(args.level);
          if (level === null) {
            sendResult(
              JSON.stringify({
                error:
                  "文字サイズを認識できませんでした。もう一度お願いします。",
              }),
            );
            return;
          }
          setFontSizeRef.current(level);
          const label = FONT_SIZE_LABELS[level] ?? level;
          void enqueueProfileSave({ fontSize: level })
            .then(() => {
              sendResult(
                JSON.stringify({
                  success: true,
                  message: `文字の大きさを「${label}」に変更しました`,
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

        if (functionName === "update_speaking_preferences") {
          const args = JSON.parse(argsJson) as {
            speaking_speed?: string;
            silence_duration?: string;
            confirmation_level?: string;
            speakingSpeed?: string;
            silenceDuration?: string;
            confirmationLevel?: string;
          };
          const speakingSpeedRaw = args.speaking_speed ?? args.speakingSpeed;
          const silenceDurationRaw =
            args.silence_duration ?? args.silenceDuration;
          const confirmationLevelRaw =
            args.confirmation_level ?? args.confirmationLevel;
          const speakingSpeed =
            speakingSpeedRaw !== undefined
              ? normalizeSpeakingSpeed(speakingSpeedRaw)
              : null;
          const silenceDuration =
            silenceDurationRaw !== undefined
              ? normalizeSilenceDuration(silenceDurationRaw)
              : null;
          const confirmationLevel =
            confirmationLevelRaw !== undefined
              ? normalizeConfirmationLevel(confirmationLevelRaw)
              : null;

          const updates: Partial<UserProfile> = {};
          if (speakingSpeed !== null) {
            updates.speakingSpeed = speakingSpeed;
          }
          if (silenceDuration !== null) {
            updates.silenceDuration = silenceDuration;
          }
          if (confirmationLevel !== null) {
            updates.confirmationLevel = confirmationLevel;
          }

          if (Object.keys(updates).length === 0) {
            sendResult(
              JSON.stringify({
                error:
                  "話し方の設定を認識できませんでした。もう一度ゆっくり教えてください。",
              }),
            );
            return;
          }

          const updatedPreferences: SpeakingPreferences = {
            speakingSpeed:
              speakingSpeed ?? speakingPrefsRef.current.speakingSpeed,
            silenceDuration:
              silenceDuration ?? speakingPrefsRef.current.silenceDuration,
            confirmationLevel:
              confirmationLevel ?? speakingPrefsRef.current.confirmationLevel,
          };

          void enqueueProfileSave(updates)
            .then(() => {
              applySpeakingPreferencesToSession(updatedPreferences);
              const changedParts: string[] = [];
              if (speakingSpeed !== null) {
                changedParts.push(
                  `話す速さを「${SPEAKING_SPEED_LABELS[speakingSpeed]}」`,
                );
              }
              if (silenceDuration !== null) {
                changedParts.push(
                  `待ち時間を「${SILENCE_DURATION_LABELS[silenceDuration]}」`,
                );
              }
              if (confirmationLevel !== null) {
                changedParts.push(
                  `確認の頻度を「${CONFIRMATION_LEVEL_LABELS[confirmationLevel]}」`,
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
    [
      webrtc,
      requestEndConversation,
      enqueueProfileSave,
      applySpeakingPreferencesToSession,
    ],
  );

  // Handle incoming data channel events
  const handleServerEvent = useCallback(
    (event: DataChannelServerEvent): void => {
      switch (event.type) {
        case "session.created":
          dispatch({ type: "CONNECTED" });
          // Keep the mic muted until the first greeting finishes.
          engageMicGuard();
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
            engageMicGuard();
          }
          dispatch({ type: "APPEND_ASSISTANT_DELTA", delta: event.delta });
          break;

        case "response.output_audio_transcript.done":
          dispatch({
            type: "FINALIZE_ASSISTANT_TRANSCRIPT",
            text: event.transcript,
          });
          if (hasOnboardingCompletionSignal(event.transcript)) {
            requestEndConversation("completion_signal");
          }
          break;

        case "conversation.item.input_audio_transcription.completed": {
          if (ignoredInputItemIdsRef.current.delete(event.item_id)) {
            break;
          }
          if (micGuardActiveRef.current) {
            break;
          }
          const acceptedTranscript = getAcceptedUserTranscript(
            event.transcript,
            {
              receivedAt: Date.now(),
              ignoreUntil: ignoreUserTranscriptsUntilRef.current,
            },
          );
          if (acceptedTranscript !== null) {
            dispatch({ type: "ADD_USER_TRANSCRIPT", text: acceptedTranscript });
            if (hasExplicitConversationEndIntent(acceptedTranscript)) {
              requestEndConversation("user_intent");
            }
          }
          break;
        }

        case "response.done": {
          aiSpeakingRef.current = false;
          dispatch({ type: "AI_DONE" });
          scheduleMicGuardRelease();

          // End-conversation flow: stop only after farewell response is observed.
          if (
            endConversationRequestedRef.current &&
            endConversationFarewellDetectedRef.current &&
            !stopAfterAudioScheduledRef.current
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

            stopAfterAudioScheduledRef.current = true;

            // Subscribe to remote audio end as an additional stop trigger
            // (fires when the server tears down the media stream).
            audioEndUnsubscribeRef.current = webrtc.onRemoteAudioEnded(() => {
              if (!stopAfterAudioScheduledRef.current) return;
              stopAfterAudioScheduledRef.current = false;
              audioEndUnsubscribeRef.current = null;
              if (endConversationStopTimeoutRef.current !== null) {
                clearTimeout(endConversationStopTimeoutRef.current);
                endConversationStopTimeoutRef.current = null;
              }
              stopRef.current();
            });

            // Timer fallback: stop after delay even if audio-end event never fires.
            endConversationStopTimeoutRef.current = setTimeout(() => {
              endConversationStopTimeoutRef.current = null;
              if (!stopAfterAudioScheduledRef.current) return;
              stopAfterAudioScheduledRef.current = false;
              if (audioEndUnsubscribeRef.current !== null) {
                audioEndUnsubscribeRef.current();
                audioEndUnsubscribeRef.current = null;
              }
              stopRef.current();
            }, END_CONVERSATION_FAREWELL_DELAY_MS);
          }
          break;
        }

        case "input_audio_buffer.speech_started":
          if (micGuardActiveRef.current) {
            if (micReenableTimerRef.current === null) {
              ignoredInputItemIdsRef.current.add(event.item_id);
              break;
            }
            releaseMicGuardNow();
          }

          // Cancel pending end flow only when user actually barges in.
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
      webrtc,
      handleFunctionCall,
      engageMicGuard,
      releaseMicGuardNow,
      scheduleMicGuardRelease,
      resetEndConversationFlow,
      requestEndConversation,
    ],
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

  useEffect(() => {
    if (state.conversationState === "error") {
      cleanupRealtimeSession();
    }
  }, [state.conversationState, cleanupRealtimeSession]);

  useEffect(() => {
    return webrtc.onRemoteAudioPlaybackFailed(() => {
      dispatch({ type: "ERROR", errorType: "unknown" });
    });
  }, [webrtc]);

  // Start the onboarding conversation
  const start = useCallback((): void => {
    resetMicGuard();
    dispatch({ type: "CONNECT" });

    // Step 1: Request mic access first (must be in user gesture context for iOS)
    webrtc
      .requestMicAccess()
      .then((micStream) => {
        return getUserProfile().then((profile) => {
          const preferences = getProfileSpeakingPreferences(profile);
          speakingPrefsRef.current = preferences;

          // Step 2: Build session config
          const character = getCharacterById("character-a");
          const instructions = buildOnboardingPrompt(preferences);

          const sessionConfig = {
            instructions,
            voice: character.voice,
            tools: [...ONBOARDING_TOOLS],
            turn_detection: {
              ...SESSION_CONFIG.turn_detection,
              silence_duration_ms:
                SILENCE_DURATION_MS_MAP[preferences.silenceDuration],
            },
          };

          // Step 3: Connect WebRTC — server handles SDP exchange
          return webrtc.connect(
            micStream,
            async (offerSdp: string): Promise<string> => {
              const result = await connectRealtimeSession(
                sessionConfig,
                offerSdp,
                true,
              );
              sessionKeyRef.current = result.sessionKey;
              return result.answerSdp;
            },
          );
        });
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
  }, [webrtc, resetMicGuard]);

  // Stop the conversation and clean up
  const stop = useCallback((): void => {
    resetEndConversationFlow();
    aiSpeakingRef.current = false;
    resetMicGuard();
    const currentTranscript = state.transcript;
    const currentCharacterId = state.characterId;

    persistOnboardingConversation(currentTranscript, currentCharacterId);

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
    speakingPrefsRef.current = DEFAULT_SPEAKING_PREFERENCES;

    // Wait briefly for any in-flight profile saves so completion screen
    // reflects the selected values reliably.
    void waitForPendingProfileSaves().finally(() => {
      onCompleteRef.current();
    });
  }, [
    state.transcript,
    state.characterId,
    persistOnboardingConversation,
    webrtc,
    resetEndConversationFlow,
    waitForPendingProfileSaves,
    resetMicGuard,
  ]);

  // Keep stopRef in sync
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Retry after an error
  const retry = useCallback((): void => {
    resetEndConversationFlow();
    resetMicGuard();
    webrtc.disconnect();
    dispatch({ type: "DISCONNECT" });
    setTimeout(() => {
      start();
    }, RETRY_DELAY_MS);
  }, [webrtc, start, resetEndConversationFlow, resetMicGuard]);

  useEffect(() => {
    return () => {
      cleanupRealtimeSessionRef.current();
    };
  }, []);

  return {
    state: state.conversationState,
    errorType: state.errorType,
    transcript: state.transcript,
    pendingAssistantText: state.pendingAssistantText,
    audioLevel: webrtc.audioLevel,
    remoteAudioLevel: webrtc.remoteAudioLevel,
    characterId: state.characterId,
    start,
    stop,
    retry,
  };
}
