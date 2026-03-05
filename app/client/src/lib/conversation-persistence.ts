import type { TranscriptEntry } from "../types/conversation";

/**
 * Returns true when transcript has at least one non-empty user utterance.
 * Used to skip persistence for empty/AI-only sessions.
 */
export function hasPersistableUserUtterance(
  transcript: TranscriptEntry[],
): boolean {
  return transcript.some(
    (entry) => entry.role === "user" && entry.text.trim().length > 0,
  );
}
