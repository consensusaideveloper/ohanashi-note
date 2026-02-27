// Post-conversation re-transcription service.
// Downloads audio from R2 and re-transcribes with gpt-4o-mini-transcribe
// for higher accuracy than the Realtime API's whisper-1.

import { Readable } from "node:stream";

import OpenAI, { toFile } from "openai";

import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { r2 } from "../lib/r2.js";

// --- Constants ---

const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const TRANSCRIPTION_LANGUAGE = "ja";
const TRANSCRIPTION_TIMEOUT_MS = 120_000;

// --- Types ---

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  text: string;
  segments: TranscriptionSegment[];
}

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

// --- Helpers ---

/** Map R2 content type to a file extension for the OpenAI API. */
function getFileExtension(contentType: string): string {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  return "webm";
}

// --- Main functions ---

/**
 * Download audio from R2 and transcribe it with gpt-4o-mini-transcribe.
 * Returns null if R2 is not configured, audio cannot be downloaded,
 * or transcription fails.
 */
export async function transcribeFromR2(
  audioStorageKey: string,
): Promise<TranscribeResult | null> {
  if (r2 === null) {
    logger.warn("R2 not configured — skipping re-transcription");
    return null;
  }

  const config = loadConfig();
  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: TRANSCRIPTION_TIMEOUT_MS,
  });

  try {
    const { data, contentType } = await r2.downloadObject(audioStorageKey);

    logger.info("Downloaded audio for re-transcription", {
      audioStorageKey,
      size: data.byteLength,
      contentType,
    });

    const ext = getFileExtension(contentType);
    const fileName = `audio.${ext}`;

    const file = await toFile(Readable.from(data), fileName, {
      type: contentType,
    });

    const response = await openai.audio.transcriptions.create({
      model: TRANSCRIPTION_MODEL,
      file,
      language: TRANSCRIPTION_LANGUAGE,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const segments: TranscriptionSegment[] = [];
    if ("segments" in response && Array.isArray(response.segments)) {
      for (const seg of response.segments) {
        segments.push({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        });
      }
    }

    logger.info("Re-transcription completed", {
      audioStorageKey,
      textLength: response.text.length,
      segmentCount: segments.length,
    });

    return {
      text: response.text,
      segments,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Re-transcription failed", {
      audioStorageKey,
      error: message,
    });
    return null;
  }
}

/**
 * Build a hybrid transcript by replacing user turns from the original
 * realtime transcript with re-transcribed text.
 *
 * Strategy: The saved audio only contains the user's microphone input.
 * The re-transcription covers all user speech as a continuous stream.
 * We keep assistant turns unchanged (they are generated text, already accurate)
 * and replace user turns with the improved transcription.
 *
 * If the re-transcription has segments with timestamps, we try to align them
 * with the original transcript's turn structure. Otherwise, we aggregate all
 * user speech from the re-transcription and distribute it across user turns.
 */
export function buildHybridTranscript(
  originalTranscript: TranscriptEntry[],
  retranscription: TranscribeResult,
): TranscriptEntry[] {
  if (originalTranscript.length === 0) {
    return originalTranscript;
  }

  // If we have segments with timestamps, try timestamp-based alignment
  if (retranscription.segments.length > 0) {
    return buildTimestampAlignedTranscript(
      originalTranscript,
      retranscription.segments,
    );
  }

  // Fallback: replace all user text with the full re-transcription
  return buildSimpleReplacementTranscript(
    originalTranscript,
    retranscription.text,
  );
}

/**
 * Align re-transcription segments to original transcript turns using
 * relative timing. The original transcript has wall-clock timestamps;
 * the re-transcription has audio-relative timestamps (seconds from start).
 */
function buildTimestampAlignedTranscript(
  original: TranscriptEntry[],
  segments: TranscriptionSegment[],
): TranscriptEntry[] {
  if (original.length === 0 || segments.length === 0) {
    return original;
  }

  // Find the conversation start time (first entry's timestamp)
  const firstTimestamp = original[0]?.timestamp;
  if (firstTimestamp === undefined) {
    // No timestamps available — fall back to proportional distribution
    return buildProportionalTranscript(original, segments);
  }

  // Build user turn boundaries from the original transcript
  // Each user turn spans from its timestamp to the next assistant turn's timestamp
  const userTurnBoundaries: Array<{
    index: number;
    startSec: number;
    endSec: number;
  }> = [];

  for (let i = 0; i < original.length; i++) {
    const entry = original[i];
    if (entry === undefined || entry.role !== "user") continue;

    const entryTimestamp = entry.timestamp ?? firstTimestamp;
    const startSec = (entryTimestamp - firstTimestamp) / 1000;

    // End time: next entry's timestamp, or end of audio
    let endSec: number;
    const nextEntry = original[i + 1];
    if (nextEntry?.timestamp !== undefined) {
      endSec = (nextEntry.timestamp - firstTimestamp) / 1000;
    } else {
      const lastSegment = segments[segments.length - 1];
      endSec = lastSegment !== undefined ? lastSegment.end : startSec + 60;
    }

    userTurnBoundaries.push({ index: i, startSec, endSec });
  }

  // Assign segments to user turns based on overlap
  const turnTexts = new Map<number, string[]>();
  for (const boundary of userTurnBoundaries) {
    turnTexts.set(boundary.index, []);
  }

  for (const segment of segments) {
    // Find the best matching user turn for this segment
    let bestMatch: { index: number; startSec: number; endSec: number } | null =
      null;
    let bestOverlap = 0;

    for (const boundary of userTurnBoundaries) {
      const overlapStart = Math.max(segment.start, boundary.startSec);
      const overlapEnd = Math.min(segment.end, boundary.endSec);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = boundary;
      }
    }

    if (bestMatch !== null) {
      const texts = turnTexts.get(bestMatch.index);
      if (texts !== undefined) {
        texts.push(segment.text.trim());
      }
    }
  }

  // Build the hybrid transcript
  const result: TranscriptEntry[] = [];
  for (let i = 0; i < original.length; i++) {
    const entry = original[i];
    if (entry === undefined) continue;

    if (entry.role === "assistant") {
      result.push(entry);
    } else {
      const improvedTexts = turnTexts.get(i);
      const improvedText =
        improvedTexts !== undefined && improvedTexts.length > 0
          ? improvedTexts.join("")
          : entry.text; // fallback to original if no segments matched
      result.push({ ...entry, text: improvedText });
    }
  }

  return result;
}

/**
 * Distribute re-transcription segments proportionally across user turns
 * when no timestamps are available in the original transcript.
 */
function buildProportionalTranscript(
  original: TranscriptEntry[],
  segments: TranscriptionSegment[],
): TranscriptEntry[] {
  const userIndices = original
    .map((entry, i) => (entry.role === "user" ? i : -1))
    .filter((i) => i >= 0);

  if (userIndices.length === 0) return original;

  // Distribute segments evenly across user turns
  const segmentsPerTurn = Math.ceil(segments.length / userIndices.length);
  const result: TranscriptEntry[] = [...original];

  for (let turnIdx = 0; turnIdx < userIndices.length; turnIdx++) {
    const originalIdx = userIndices[turnIdx];
    if (originalIdx === undefined) continue;
    const startSeg = turnIdx * segmentsPerTurn;
    const endSeg = Math.min(startSeg + segmentsPerTurn, segments.length);
    const turnSegments = segments.slice(startSeg, endSeg);

    if (turnSegments.length > 0) {
      const text = turnSegments.map((s) => s.text.trim()).join("");
      const originalEntry = result[originalIdx];
      if (originalEntry !== undefined) {
        result[originalIdx] = { ...originalEntry, text };
      }
    }
  }

  return result;
}

/**
 * Simple replacement: distribute the full re-transcription text
 * across user turns proportionally by original text length.
 */
function buildSimpleReplacementTranscript(
  original: TranscriptEntry[],
  fullText: string,
): TranscriptEntry[] {
  const userIndices = original
    .map((entry, i) => (entry.role === "user" ? i : -1))
    .filter((i) => i >= 0);

  if (userIndices.length === 0) return original;

  // If only one user turn, replace directly
  if (userIndices.length === 1) {
    const idx = userIndices[0];
    if (idx === undefined) return original;
    const result = [...original];
    const originalEntry = result[idx];
    if (originalEntry !== undefined) {
      result[idx] = { ...originalEntry, text: fullText.trim() };
    }
    return result;
  }

  // Multiple user turns: distribute proportionally by original char length
  const totalOriginalChars = userIndices.reduce((sum, idx) => {
    const entry = original[idx];
    return sum + (entry !== undefined ? entry.text.length : 0);
  }, 0);

  if (totalOriginalChars === 0) return original;

  const result = [...original];
  let charOffset = 0;

  for (let i = 0; i < userIndices.length; i++) {
    const idx = userIndices[i];
    if (idx === undefined) continue;
    const originalEntry = original[idx];
    if (originalEntry === undefined) continue;

    const proportion = originalEntry.text.length / totalOriginalChars;
    const charCount = Math.round(fullText.length * proportion);
    const text =
      i === userIndices.length - 1
        ? fullText.slice(charOffset).trim()
        : fullText.slice(charOffset, charOffset + charCount).trim();
    charOffset += charCount;

    result[idx] = { ...originalEntry, text };
  }

  return result;
}
