export type ConversationState =
  | "idle"
  | "connecting"
  | "listening"
  | "ai-speaking"
  | "error";

export type ErrorType = "microphone" | "network" | "aiUnavailable" | "unknown";

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export type WebSocketStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type QuestionCategory =
  | "memories"
  | "people"
  | "house"
  | "medical"
  | "funeral"
  | "money"
  | "work"
  | "digital"
  | "legal"
  | "trust"
  | "support";

export type CharacterId = "character-a" | "character-b" | "character-c";

export type OpenAIVoice =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  description: string;
  personality: string;
  voice: OpenAIVoice;
  accentColorClass: string;
}

export interface NoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
}

export interface KeyPoints {
  importantStatements: string[];
  decisions: string[];
  undecidedItems: string[];
}

export interface ConversationRecord {
  id: string;
  category: QuestionCategory | null;
  characterId: CharacterId | null;
  startedAt: number;
  endedAt: number | null;
  transcript: TranscriptEntry[];
  summary: string | null;
  coveredQuestionIds?: string[];
  noteEntries?: NoteEntry[];
  summaryStatus?: "pending" | "completed" | "failed";
  /** Whether an audio recording is stored. */
  audioAvailable?: boolean;
  /** R2 storage key for the audio recording. */
  audioStorageKey?: string;
  /** MIME type of the stored audio recording. */
  audioMimeType?: string;
  /** Short one-line summary for list card display. */
  oneLinerSummary?: string;
  /** Emotion/atmosphere analysis of the conversation. */
  emotionAnalysis?: string;
  /** Topic categories actually discussed in this conversation. */
  discussedCategories?: QuestionCategory[];
  /** Structured key points extracted from the conversation. */
  keyPoints?: KeyPoints;
  /** How well the conversation stayed on ending-note topics. */
  topicAdherence?: "high" | "medium" | "low";
  /** Brief description of off-topic segments, if any. */
  offTopicSummary?: string;
  /** SHA-256 hash of canonical content fields, computed after finalization. */
  integrityHash?: string;
  /** SHA-256 hash of the audio recording blob. */
  audioHash?: string;
  /** Timestamp (ms since epoch) when the integrity hash was computed. */
  integrityHashedAt?: number;
}

export interface AudioRecording {
  conversationId: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

export type IntegrityStatus = "verified" | "tampered" | "no-hash";

export interface IntegrityVerificationResult {
  conversationId: string;
  contentStatus: IntegrityStatus;
  audioStatus: IntegrityStatus;
}

export type FontSizeLevel = "standard" | "large" | "x-large";

export interface UserProfile {
  name: string;
  characterId?: CharacterId | null;
  fontSize?: FontSizeLevel;
  updatedAt: number;
}
