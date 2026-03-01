/**
 * Audio utility functions for conversation hooks.
 */

import { NOISE_TRANSCRIPT_PATTERNS, NOISE_TRANSCRIPT_REGEX } from "./constants";

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
