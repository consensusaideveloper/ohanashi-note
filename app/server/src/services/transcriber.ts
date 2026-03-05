// Post-conversation re-transcription service.
// Downloads audio from R2 and re-transcribes with a higher-accuracy model.

import { Readable } from "node:stream";

import OpenAI, { toFile } from "openai";

import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { r2 } from "../lib/r2.js";

// --- Constants ---

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

function parseTranscriptionSegments(value: unknown): TranscriptionSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsedSegments: TranscriptionSegment[] = [];
  for (const rawSegment of value) {
    if (typeof rawSegment !== "object" || rawSegment === null) {
      continue;
    }
    const candidate = rawSegment as Record<string, unknown>;
    const start = candidate["start"];
    const end = candidate["end"];
    const text = candidate["text"];

    if (
      typeof start === "number" &&
      typeof end === "number" &&
      typeof text === "string"
    ) {
      parsedSegments.push({ start, end, text });
    }
  }

  return parsedSegments;
}

// --- Main functions ---

/**
 * Download audio from R2 and transcribe it with the configured model.
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
      model: config.openaiModels.retranscription,
      file,
      language: TRANSCRIPTION_LANGUAGE,
      response_format: "json",
    });

    const responseRecord = response as unknown as Record<string, unknown>;
    const segments = parseTranscriptionSegments(responseRecord["segments"]);

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

function buildSyntheticUserTurn(
  original: TranscriptEntry[],
  fullText: string,
): TranscriptEntry[] {
  const trimmed = fullText.trim();
  if (trimmed.length === 0) {
    return original;
  }

  const lastEntry = original[original.length - 1];
  const syntheticTimestamp =
    lastEntry?.timestamp !== undefined ? lastEntry.timestamp + 1 : undefined;

  return [
    ...original,
    {
      role: "user",
      text: trimmed,
      ...(syntheticTimestamp !== undefined
        ? { timestamp: syntheticTimestamp }
        : {}),
    },
  ];
}

function splitTextAcrossTurns(fullText: string, turnCount: number): string[] {
  const trimmed = fullText.trim();
  if (trimmed.length === 0 || turnCount <= 0) {
    return [];
  }

  const sentences =
    trimmed.match(/[^。！？!?]+[。！？!?]?/g)?.map((part) => part.trim()) ?? [];

  if (sentences.length > 1) {
    const buckets = Array.from({ length: turnCount }, () => "");
    let sentenceIndex = 0;
    for (const sentence of sentences) {
      const bucketIndex = Math.min(sentenceIndex, turnCount - 1);
      const currentBucket = buckets[bucketIndex] ?? "";
      buckets[bucketIndex] =
        currentBucket.length > 0 ? `${currentBucket} ${sentence}` : sentence;
      if (bucketIndex < turnCount - 1) {
        sentenceIndex += 1;
      }
    }
    return buckets
      .map((bucket) => bucket.trim())
      .filter((bucket) => bucket !== "");
  }

  const chunks: string[] = [];
  let charOffset = 0;
  for (let i = 0; i < turnCount; i++) {
    const remainingTurns = turnCount - i;
    const remainingChars = trimmed.length - charOffset;
    const charCount =
      i === turnCount - 1
        ? remainingChars
        : Math.max(1, Math.round(remainingChars / remainingTurns));
    const chunk = trimmed.slice(charOffset, charOffset + charCount).trim();
    chunks.push(chunk);
    charOffset += charCount;
  }
  return chunks;
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

  if (userIndices.length === 0) {
    return buildSyntheticUserTurn(original, fullText);
  }

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

  if (totalOriginalChars === 0) {
    const chunks = splitTextAcrossTurns(fullText, userIndices.length);
    const result = [...original];

    for (let i = 0; i < userIndices.length; i++) {
      const idx = userIndices[i];
      const originalEntry = idx !== undefined ? result[idx] : undefined;
      const chunk = chunks[i];
      if (
        idx === undefined ||
        originalEntry === undefined ||
        chunk === undefined
      ) {
        continue;
      }
      result[idx] = { ...originalEntry, text: chunk };
    }

    return result;
  }

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
