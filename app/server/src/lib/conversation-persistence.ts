interface TranscriptEntryLike {
  role?: unknown;
  text?: unknown;
}

function isTranscriptEntryLike(value: unknown): value is TranscriptEntryLike {
  return typeof value === "object" && value !== null;
}

/**
 * Returns true only when transcript contains at least one non-empty user utterance.
 * Used to prevent persisting empty/AI-only sessions.
 */
export function hasPersistableUserUtterance(transcript: unknown): boolean {
  if (!Array.isArray(transcript)) {
    return false;
  }

  return transcript.some((entry) => {
    if (!isTranscriptEntryLike(entry)) {
      return false;
    }
    if (entry.role !== "user") {
      return false;
    }
    if (typeof entry.text !== "string") {
      return false;
    }
    return entry.text.trim().length > 0;
  });
}
