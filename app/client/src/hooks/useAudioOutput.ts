import { useCallback, useEffect, useRef, useState } from "react";

import { AUDIO_SAMPLE_RATE } from "../lib/constants";
import { base64ToArrayBuffer, pcm16ToFloat32 } from "../lib/audio";

// Safari compatibility: webkitAudioContext fallback
// The `as unknown` cast is necessary because `window` does not have an index
// signature that satisfies `Record<string, unknown>` directly.
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
const AudioContextClass: typeof AudioContext =
  window.AudioContext ||
  ((window as unknown as Record<string, unknown>)
    .webkitAudioContext as typeof AudioContext);
/* eslint-enable @typescript-eslint/no-unnecessary-condition */

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
 */
export function useAudioOutput(): UseAudioOutputReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  /** Lazily initialise the playback AudioContext. */
  const getAudioContext = useCallback((): AudioContext => {
    let ctx = audioContextRef.current;
    if (ctx === null) {
      ctx = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = ctx;
    }
    return ctx;
  }, []);

  /** Update isPlaying based on the number of active sources. */
  const updatePlayingState = useCallback((): void => {
    setIsPlaying(activeSourcesRef.current.size > 0);
  }, []);

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

      // Create a source node for this chunk
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // Schedule gapless playback
      const now = audioContext.currentTime;
      const startTime =
        nextStartTimeRef.current > now ? nextStartTimeRef.current : now;

      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      // Track active source for cleanup and isPlaying state
      activeSourcesRef.current.add(source);
      updatePlayingState();

      source.onended = (): void => {
        activeSourcesRef.current.delete(source);
        updatePlayingState();
      };
    },
    [getAudioContext, updatePlayingState],
  );

  const stopPlayback = useCallback((): void => {
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
    setIsPlaying(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Stop all sources
      for (const source of activeSourcesRef.current) {
        try {
          source.stop();
        } catch {
          // Ignore
        }
      }
      activeSourcesRef.current.clear();

      const ctx = audioContextRef.current;
      if (ctx !== null) {
        void ctx.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  return {
    enqueueAudio,
    stopPlayback,
    isPlaying,
  };
}
