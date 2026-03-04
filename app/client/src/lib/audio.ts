/**
 * Audio utility functions for conversation hooks.
 */

import {
  MIN_TRANSCRIPT_LENGTH,
  NOISE_TRANSCRIPT_PATTERNS,
  NOISE_TRANSCRIPT_REGEX,
} from "./constants";

/**
 * Check if a transcript matches known noise/hallucination patterns
 * commonly produced by Whisper when processing silence or ambient noise.
 */
export function isNoiseTranscript(text: string): boolean {
  if (NOISE_TRANSCRIPT_REGEX.test(text)) return true;
  return NOISE_TRANSCRIPT_PATTERNS.some(
    (pattern) => text === pattern || text.includes(pattern),
  );
}

interface AcceptUserTranscriptOptions {
  /** Timestamp when the transcript is received on the client. */
  receivedAt?: number;
  /** Ignore transcripts received before this timestamp. */
  ignoreUntil?: number;
}

/**
 * Normalize and validate a user transcript before adding it to history.
 * Returns null for short/noisy/guarded transcripts.
 */
export function getAcceptedUserTranscript(
  text: string,
  options: AcceptUserTranscriptOptions = {},
): string | null {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TRANSCRIPT_LENGTH) {
    return null;
  }
  if (isNoiseTranscript(trimmed)) {
    return null;
  }

  const receivedAt = options.receivedAt ?? Date.now();
  const ignoreUntil = options.ignoreUntil ?? 0;
  if (receivedAt < ignoreUntil) {
    return null;
  }

  return trimmed;
}
