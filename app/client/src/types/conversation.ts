export type ConversationState =
  | "idle"
  | "connecting"
  | "listening"
  | "ai-speaking"
  | "error";

export type ErrorType =
  | "microphone"
  | "network"
  | "aiUnavailable"
  | "quotaExceeded"
  | "unknown";

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
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "fable"
  | "onyx"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

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
  /** Optional verbatim quote from user speech used as grounding evidence. */
  sourceEvidence?: string;
}

export interface NoteUpdateProposal {
  questionId: string;
  questionTitle: string;
  category: QuestionCategory;
  questionType: "single" | "accumulative";
  proposalType: "add" | "update";
  previousAnswer: string | null;
  proposedAnswer: string;
  sourceEvidence: string;
}

export interface NoteUpdateProposalTarget {
  questionId: string;
  proposedAnswer: string;
}

export type InsightCategory =
  | "hobbies"
  | "values"
  | "relationships"
  | "memories"
  | "concerns"
  | "other";

export type InsightImportance = "high" | "medium" | "low";

export interface InsightStatement {
  text: string;
  category: InsightCategory;
  importance: InsightImportance;
}

/** Extracts display text from an InsightStatement or legacy string format. */
export function getInsightText(item: InsightStatement | string): string {
  return typeof item === "string" ? item : item.text;
}

/** Normalizes a legacy string or InsightStatement to InsightStatement. */
export function normalizeInsightStatement(
  item: InsightStatement | string,
): InsightStatement {
  if (typeof item === "string") {
    return { text: item, category: "other", importance: "medium" };
  }
  return item;
}

export interface KeyPoints {
  importantStatements: Array<InsightStatement | string>;
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
  pendingNoteEntries?: NoteEntry[];
  noteUpdateProposals?: NoteUpdateProposal[];
  summaryStatus?: "pending" | "completed" | "failed";
  /** Whether an audio recording is stored. */
  audioAvailable?: boolean;
  /** R2 storage key for the audio recording. */
  audioStorageKey?: string;
  /** MIME type of the stored audio recording. */
  audioMimeType?: string;
  /** Short one-line summary for list card display. */
  oneLinerSummary?: string;
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

export interface VoiceActionResult {
  success: boolean;
  /** Japanese message for the AI to read aloud. */
  message: string;
}

export type IntegrityStatus = "verified" | "tampered" | "no-hash";

export interface IntegrityVerificationResult {
  conversationId: string;
  contentStatus: IntegrityStatus;
  audioStatus: IntegrityStatus;
}

export type FontSizeLevel = "standard" | "large" | "x-large";

export type SpeakingSpeed = "slow" | "normal" | "fast";
export type SilenceDuration = "short" | "normal" | "long";
export type ConfirmationLevel = "frequent" | "normal" | "minimal";

export interface SpeakingPreferences {
  speakingSpeed: SpeakingSpeed;
  silenceDuration: SilenceDuration;
  confirmationLevel: ConfirmationLevel;
}

export interface UserProfile {
  id?: string;
  name: string;
  assistantName?: string | null;
  characterId?: CharacterId | null;
  fontSize?: FontSizeLevel;
  speakingSpeed?: SpeakingSpeed;
  silenceDuration?: SilenceDuration;
  confirmationLevel?: ConfirmationLevel;
  updatedAt: number;
}
