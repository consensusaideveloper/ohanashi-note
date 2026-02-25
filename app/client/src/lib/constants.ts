import type { FontSizeLevel } from "../types/conversation";

// WebSocket URL — in development, Vite proxy handles /ws
// In production, same origin serves both static files and WebSocket
export const WS_URL =
  import.meta.env.MODE === "production"
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.host}/ws`;

// Reconnection settings
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 10000;

// Audio settings
export const AUDIO_SAMPLE_RATE = 24000;
export const AUDIO_BUFFER_SIZE = 4096;

// OpenAI Realtime API session config (voice is set dynamically per character)
export const SESSION_CONFIG = {
  modalities: ["text", "audio"] as Array<"text" | "audio">,
  input_audio_format: "pcm16" as const,
  output_audio_format: "pcm16" as const,
  input_audio_transcription: { model: "whisper-1" },
  turn_detection: {
    type: "server_vad" as const,
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 1000, // generous pause for natural conversation
  },
  temperature: 0.7,
} as const;

// Function calling tools for the Realtime API session
export const REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "search_past_conversations",
    description:
      "過去の会話から関連する内容を検索します。ユーザーが「前に話した〇〇」「以前の話」などと言及した場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "検索キーワード（例：「旅行」「家族」「お墓」）",
        },
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description:
            "検索対象のカテゴリ（省略可。省略すると全カテゴリを検索）",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "get_note_entries",
    description:
      "指定カテゴリのエンディングノートに記録済みの内容を取得します。ユーザーが「これまでに記録した内容を確認したい」「何を話したか見たい」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description: "取得するカテゴリ",
        },
      },
      required: ["category"],
    },
  },
] as const;

// User-facing messages (Japanese)
export const UI_MESSAGES = {
  idle: "お話ししましょう",
  connecting: "準備しています...",
  listening: "ゆっくりとお話しください",
  aiSpeaking: "お答えしています",
  error: {
    microphone: "マイクが使えません。「許可」ボタンを押してください。",
    network:
      "インターネットの接続が不安定です。しばらくしてからもう一度お試しください。",
    aiUnavailable:
      "ただいま混み合っています。少し時間をおいてからお試しください。",
    unknown: "うまくいきませんでした。もう一度お試しください。",
  },
  buttons: {
    start: "お話しを始める",
    stop: "お話しを終える",
    retry: "もう一度やり直す",
    connecting: "接続しています...",
  },
} as const;

// --- UI timing ---
export const SAVE_MESSAGE_TIMEOUT_MS = 3000;
export const RETRY_DELAY_MS = 300;

// --- Data limits ---
export const CROSS_CATEGORY_RECORDS_LIMIT = 5;
export const FOCUSED_SUMMARIES_LIMIT = 7;
export const GUIDED_RECENT_SUMMARIES_LIMIT = 10;

// --- Font size settings ---
export const DEFAULT_FONT_SIZE_LEVEL: FontSizeLevel = "standard";

export const FONT_SIZE_OPTIONS: readonly {
  readonly value: FontSizeLevel;
  readonly label: string;
}[] = [
  { value: "standard", label: "ふつう" },
  { value: "large", label: "大きめ" },
  { value: "x-large", label: "とても大きい" },
] as const;

// --- Text display ---
export const TRANSCRIPT_PREVIEW_MAX_LENGTH = 80;

// --- Transcript disclaimer ---
export const TRANSCRIPT_DISCLAIMER =
  "音声から自動で文字に起こしたものです。実際の会話と異なる場合がありますので、正確な内容は録音データでご確認ください。" as const;
