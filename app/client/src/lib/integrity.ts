import type {
  ConversationRecord,
  AudioRecording,
  IntegrityStatus,
  IntegrityVerificationResult,
} from "../types/conversation";

/**
 * Canonical content shape used for deterministic hashing.
 * Keys are in a fixed order to ensure JSON.stringify produces identical output
 * for identical content regardless of how the original object was constructed.
 */
interface CanonicalContent {
  id: string;
  category: string | null;
  characterId: string | null;
  startedAt: number;
  endedAt: number | null;
  transcript: Array<{ role: string; text: string; timestamp: number }>;
  summary: string | null;
  noteEntries:
    | Array<{ questionId: string; questionTitle: string; answer: string }>
    | undefined;
  keyPoints:
    | {
        importantStatements: string[];
        decisions: string[];
        undecidedItems: string[];
      }
    | undefined;
}

/**
 * Convert a hash ArrayBuffer to a lowercase hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      hex += byte.toString(16).padStart(2, "0");
    }
  }
  return hex;
}

/**
 * Compute SHA-256 hash of a string and return as lowercase hex.
 */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Build a canonical JSON string from a ConversationRecord.
 * Only includes content fields in a fixed key order for deterministic hashing.
 * Excludes metadata fields (summaryStatus, audioAvailable, etc.) and hash fields.
 */
export function buildCanonicalContent(record: ConversationRecord): string {
  const canonical: CanonicalContent = {
    id: record.id,
    category: record.category,
    characterId: record.characterId,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    transcript: record.transcript.map((entry) => ({
      role: entry.role,
      text: entry.text,
      timestamp: entry.timestamp,
    })),
    summary: record.summary,
    noteEntries:
      record.noteEntries !== undefined
        ? record.noteEntries.map((entry) => ({
            questionId: entry.questionId,
            questionTitle: entry.questionTitle,
            answer: entry.answer,
          }))
        : undefined,
    keyPoints:
      record.keyPoints !== undefined
        ? {
            importantStatements: [...record.keyPoints.importantStatements],
            decisions: [...record.keyPoints.decisions],
            undecidedItems: [...record.keyPoints.undecidedItems],
          }
        : undefined,
  };
  return JSON.stringify(canonical);
}

/**
 * Compute SHA-256 hash of a ConversationRecord's content fields.
 */
export async function computeContentHash(
  record: ConversationRecord,
): Promise<string> {
  const canonical = buildCanonicalContent(record);
  return sha256Hex(canonical);
}

/**
 * Compute SHA-256 hash of a Blob (e.g., audio recording).
 */
export async function computeBlobHash(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const hashBuffer = await crypto.subtle.digest("SHA-256", uint8);
  return bufferToHex(hashBuffer);
}

/**
 * Verify the integrity of a conversation record and its associated audio.
 * Compares stored hashes against freshly computed hashes.
 *
 * Returns:
 * - "verified" if hashes match
 * - "tampered" if hashes do not match (or audio is missing when hash exists)
 * - "no-hash" if the record has no stored hash (legacy record)
 */
export async function verifyRecordIntegrity(
  record: ConversationRecord,
  audioRecording: AudioRecording | null,
): Promise<IntegrityVerificationResult> {
  let contentStatus: IntegrityStatus;

  if (record.integrityHash === undefined) {
    contentStatus = "no-hash";
  } else {
    const actualHash = await computeContentHash(record);
    contentStatus =
      actualHash === record.integrityHash ? "verified" : "tampered";
  }

  let audioStatus: IntegrityStatus;

  if (record.audioHash === undefined) {
    audioStatus = "no-hash";
  } else if (audioRecording === null) {
    // Hash exists but audio is missing
    audioStatus = "tampered";
  } else {
    const actualAudioHash = await computeBlobHash(audioRecording.blob);
    audioStatus =
      actualAudioHash === record.audioHash ? "verified" : "tampered";
  }

  return {
    conversationId: record.id,
    contentStatus,
    audioStatus,
  };
}
