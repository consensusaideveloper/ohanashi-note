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
  input_audio_transcription: { model: "whisper-1", language: "ja" },
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
    saveFailed: "保存できませんでした。もう一度お試しください。",
    exportFailed: "データの書き出しに失敗しました。もう一度お試しください。",
    deleteFailed: "削除できませんでした。もう一度お試しください。",
    summaryFailed:
      "お話のまとめを作れませんでした。会話の内容は保存されていますのでご安心ください。",
    noteLoadFailed: "ノートの内容を読み込めませんでした。",
    historyLoadFailed: "会話の記録を読み込めませんでした。",
  },
  sessionWarning: "まもなくお時間です。お話をまとめましょう。",
  sessionExpired: "お時間になりましたので、今日のお話はここまでにしましょう。",
  dailyLimitReached:
    "本日の会話回数の上限に達しました。また明日お話ししましょう。",
  buttons: {
    start: "お話しを始める",
    stop: "お話しを終える",
    retry: "もう一度やり直す",
    connecting: "接続しています...",
  },
} as const;

// --- Session limits ---
/** Maximum session duration in milliseconds (20 minutes). */
export const MAX_SESSION_DURATION_MS = 20 * 60 * 1000;
/** Fraction of session time elapsed before showing the warning (85% = ~3 min left). */
export const SESSION_WARNING_THRESHOLD = 0.85;
/** Maximum number of conversation sessions per day. */
export const MAX_DAILY_SESSIONS = 5;

// --- UI timing ---
export const RETRY_DELAY_MS = 300;
export const TOAST_DISPLAY_DURATION_MS = 5000;

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

// --- Login screen messages (Japanese) ---
export const LOGIN_MESSAGES = {
  subtitle: "会話をしながら\n大切な想いをノートにまとめましょう",
  signingIn: "ログイン中...",
  signInButton: "Googleでログイン",
  error: "ログインできませんでした。もう一度お試しください。",
  footer: "Googleアカウントで安全にログインできます",
} as const;

// --- Settings screen messages (Japanese) ---
export const SETTINGS_MESSAGES = {
  profile: {
    description:
      "お名前と話し相手を設定します。変更したら「保存する」を押してください。",
  },
  account: {
    description: "現在ログイン中のアカウントです",
    logoutConfirm:
      "ログアウトしてもよろしいですか？データは保存されたままです。同じアカウントで再度ログインできます。",
  },
  backup: {
    importDescription:
      "バックアップファイルからデータを復元します。現在のデータは上書きされます。",
    importConfirm:
      "現在の会話やノートの記録がバックアップファイルの内容で上書きされます。よろしいですか？",
  },
  deletion: {
    description:
      "これまでの会話やノートの記録がすべて完全に削除されます。この操作は取り消すことができません。",
    confirm:
      "会話の記録、ノートの内容、プロフィールがすべて削除されます。削除したデータは元に戻せません。本当に削除しますか？",
  },
} as const;

// --- Text display ---
export const TRANSCRIPT_PREVIEW_MAX_LENGTH = 80;

// --- Transcript disclaimer ---
export const TRANSCRIPT_DISCLAIMER =
  "音声から自動で文字に起こしたものです。実際の会話と異なる場合がありますので、正確な内容は録音データでご確認ください。" as const;
