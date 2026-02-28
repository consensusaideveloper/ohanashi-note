import { useCallback, useEffect, useRef, useState } from "react";

import { AUDIO_SAMPLE_RATE } from "../lib/constants";
import {
  base64ToArrayBuffer,
  pcm16ToFloat32,
  AudioContextClass,
} from "../lib/audio";

/** Number of audio chunks to buffer before starting playback. */
const PRE_BUFFER_CHUNKS = 2;

interface UseAudioOutputReturn {
  /** Decode and enqueue a base64-encoded PCM16 audio chunk for gapless playback. */
  enqueueAudio: (base64: string) => void;
  /** Stop all playback, clear the queue, and reset scheduling state. */
  stopPlayback: () => void;
  /** Whether audio is currently playing or queued for playback. */
  isPlaying: boolean;
}

/**
 * Audio playback hook for streaming PCM chunks from the OpenAI Realtime API.
 *
 * Accepts base64-encoded PCM16 audio, converts it to Float32 samples,
 * creates AudioBufferSourceNodes, and schedules them for gapless playback
 * using precise timing (nextStartTime tracking).
 *
 * Uses a dedicated AudioContext for output, separate from the input context.
 * This follows the OpenAI official demo pattern and avoids iOS "playAndRecord"
 * audio session mode that degrades speaker quality.
 *
 * Improvements for mobile reliability:
 * - GainNode routing: source -> gain -> destination for clean stop without pops
 * - Pre-buffering: collects initial chunks before starting playback to prevent
 *   buffer underrun from network jitter
 */
export function useAudioOutput(): UseAudioOutputReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const preBufferRef = useRef<AudioBuffer[]>([]);
  const isStreamingRef = useRef(false);

  /** Get or create the output AudioContext and GainNode. */
  const getAudioContext = useCallback((): AudioContext => {
    let ctx = audioContextRef.current;
    if (ctx === null || ctx.state === "closed") {
      ctx = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = ctx;
      // Create a persistent GainNode for this context
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
    }
    return ctx;
  }, []);

  /** Update isPlaying based on the number of active sources. */
  const updatePlayingState = useCallback((): void => {
    setIsPlaying(activeSourcesRef.current.size > 0);
  }, []);

  /** Schedule an AudioBuffer for gapless playback. */
  const scheduleBuffer = useCallback(
    (audioContext: AudioContext, audioBuffer: AudioBuffer): void => {
      const gain = gainNodeRef.current;
      if (gain === null) return;

      // Ensure gain is at full volume (may have been zeroed by stopPlayback)
      gain.gain.value = 1;

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);

      const now = audioContext.currentTime;
      const startTime =
        nextStartTimeRef.current > now ? nextStartTimeRef.current : now;

      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      updatePlayingState();

      source.onended = (): void => {
        activeSourcesRef.current.delete(source);
        // When all sources have finished, reset streaming state so the
        // next AI response gets pre-buffered (prevents jitter gaps).
        if (activeSourcesRef.current.size === 0) {
          isStreamingRef.current = false;
        }
        updatePlayingState();
      };
    },
    [updatePlayingState],
  );

  const enqueueAudio = useCallback(
    (base64: string): void => {
      const audioContext = getAudioContext();

      // Resume if suspended (e.g. iOS Safari autoplay policy)
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      // Decode base64 -> PCM16 -> Float32
      const pcm16Buffer = base64ToArrayBuffer(base64);
      const float32Data = pcm16ToFloat32(pcm16Buffer);

      // Create an AudioBuffer and fill it with the decoded samples
      const audioBuffer = audioContext.createBuffer(
        1, // mono
        float32Data.length,
        AUDIO_SAMPLE_RATE,
      );
      audioBuffer.getChannelData(0).set(float32Data);

      // Pre-buffering: collect initial chunks before starting playback
      // to prevent buffer underrun from mobile network jitter.
      if (!isStreamingRef.current) {
        preBufferRef.current.push(audioBuffer);
        if (preBufferRef.current.length >= PRE_BUFFER_CHUNKS) {
          // Flush all buffered chunks
          isStreamingRef.current = true;
          for (const buffered of preBufferRef.current) {
            scheduleBuffer(audioContext, buffered);
          }
          preBufferRef.current = [];
        }
        return;
      }

      // Already streaming — schedule immediately
      scheduleBuffer(audioContext, audioBuffer);
    },
    [getAudioContext, scheduleBuffer],
  );

  const stopPlayback = useCallback((): void => {
    // Zero the gain to avoid pops on iOS when stopping sources abruptly
    const gain = gainNodeRef.current;
    if (gain !== null) {
      gain.gain.value = 0;
    }

    // Stop all currently playing/scheduled sources
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source may have already finished; ignore
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    preBufferRef.current = [];
    isStreamingRef.current = false;
    setIsPlaying(false);
  }, []);

  // Clean up on unmount — stop sources but do NOT close the AudioContext
  // (iOS may error if we re-create too many contexts)
  useEffect(() => {
    return () => {
      for (const source of activeSourcesRef.current) {
        try {
          source.stop();
        } catch {
          // Ignore
        }
      }
      activeSourcesRef.current.clear();
      preBufferRef.current = [];
      isStreamingRef.current = false;
    };
  }, []);

  return {
    enqueueAudio,
    stopPlayback,
    isPlaying,
  };
}
