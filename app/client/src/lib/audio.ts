/**
 * PCM conversion utilities for the Web Audio API.
 *
 * OpenAI Realtime API uses 16-bit signed integer PCM (PCM16) at 24 kHz.
 * The Web Audio API uses 32-bit float samples in the range [-1, 1].
 * These helpers bridge the two formats and handle base64 encoding.
 */

import {
  AUDIO_SAMPLE_RATE,
  NOISE_TRANSCRIPT_PATTERNS,
  NOISE_TRANSCRIPT_REGEX,
} from "./constants";

// Safari compatibility: webkitAudioContext fallback
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
const AudioContextClass: typeof AudioContext =
  window.AudioContext ||
  ((window as unknown as Record<string, unknown>)
    .webkitAudioContext as typeof AudioContext);
/* eslint-enable @typescript-eslint/no-unnecessary-condition */

/**
 * Module-level shared AudioContext for mobile compatibility.
 * Mobile browsers have limited AudioContext resources; sharing a single
 * context between input and output prevents resource contention and
 * choppy playback.
 */
let sharedAudioContext: AudioContext | null = null;

/**
 * Get or create the shared AudioContext. Both useAudioInput and
 * useAudioOutput should use this instead of creating their own.
 * The context is never closed — it lives for the page session.
 */
export function getSharedAudioContext(): AudioContext {
  if (sharedAudioContext === null || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass({
      sampleRate: AUDIO_SAMPLE_RATE,
    });
  }
  return sharedAudioContext;
}

/**
 * Convert Float32 audio samples (Web Audio API range [-1, 1]) to
 * 16-bit signed integer PCM (for sending to OpenAI).
 */
export function float32ToPcm16(float32Array: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const sample = float32Array[i] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm16.buffer;
}

/**
 * Convert 16-bit signed integer PCM back to Float32
 * (for playback from OpenAI through Web Audio API).
 */
export function pcm16ToFloat32(pcm16Buffer: ArrayBuffer): Float32Array {
  const pcm16 = new Int16Array(pcm16Buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    const sample = pcm16[i] ?? 0;
    float32[i] = sample / 0x8000;
  }
  return float32;
}

/**
 * Encode an ArrayBuffer to a base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

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
