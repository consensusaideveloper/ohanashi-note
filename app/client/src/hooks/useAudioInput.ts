import { useCallback, useEffect, useRef, useState } from "react";

import { AUDIO_BUFFER_SIZE, AUDIO_SAMPLE_RATE } from "../lib/constants";
import {
  float32ToPcm16,
  arrayBufferToBase64,
  AudioContextClass,
} from "../lib/audio";

/** Callback invoked with a base64-encoded PCM16 audio chunk and its RMS level. */
type AudioChunkCallback = (base64: string, rmsLevel: number) => void;

interface UseAudioInputProps {
  /** Called for each captured audio chunk (base64-encoded PCM16). */
  onAudioChunk: AudioChunkCallback;
}

interface UseAudioInputReturn {
  /** Begin capturing audio from the microphone. Must be called from a user gesture handler. */
  startCapture: () => Promise<void>;
  /** Stop capturing and release all resources. */
  stopCapture: () => void;
  /** Whether microphone capture is currently active. */
  isCapturing: boolean;
  /** RMS audio level in the range [0.0, 1.0] for visualisation. */
  audioLevel: number;
}

/**
 * Calculate the RMS (root-mean-square) level of an audio buffer.
 * Returns a value in [0.0, 1.0].
 */
function calculateRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Microphone capture hook.
 *
 * Uses the Web Audio API to capture audio from the user's microphone,
 * converts it to base64-encoded PCM16, and delivers chunks through the
 * `onAudioChunk` callback. Designed for use with the OpenAI Realtime API.
 *
 * MediaRecorder is intentionally NOT used during capture. Running a
 * parallel MediaRecorder (webm/opus encoding every 1s) causes CPU
 * contention with the ScriptProcessorNode on mobile, resulting in
 * choppy audio playback. Audio recording is handled server-side.
 *
 * Uses a dedicated AudioContext for input, separate from the output
 * context. This follows the OpenAI official demo pattern and avoids
 * iOS "playAndRecord" audio session mode that degrades speaker quality.
 *
 * iOS Safari notes:
 * - AudioContext must be created / resumed inside a user gesture handler.
 * - `startCapture()` handles this requirement.
 * - Uses `webkitAudioContext` fallback automatically.
 */
export function useAudioInput({
  onAudioChunk,
}: UseAudioInputProps): UseAudioInputReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Use a ref for the callback so the ScriptProcessorNode closure
  // always sees the latest callback without needing to reconnect nodes.
  const onAudioChunkRef = useRef<AudioChunkCallback>(onAudioChunk);
  onAudioChunkRef.current = onAudioChunk;

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const capturingRef = useRef(false);

  /** Release capture resources (nodes, stream). Does NOT close the AudioContext. */
  const releaseResources = useCallback((): void => {
    const processorNode = processorNodeRef.current;
    if (processorNode !== null) {
      processorNode.onaudioprocess = null;
      processorNode.disconnect();
      processorNodeRef.current = null;
    }

    const sourceNode = sourceNodeRef.current;
    if (sourceNode !== null) {
      sourceNode.disconnect();
      sourceNodeRef.current = null;
    }

    const mediaStream = mediaStreamRef.current;
    if (mediaStream !== null) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    capturingRef.current = false;
    setIsCapturing(false);
    setAudioLevel(0);
  }, []);

  const startCapture = useCallback(async (): Promise<void> => {
    // Prevent double-start
    if (capturingRef.current) {
      return;
    }

    // Request microphone access.
    // Do NOT specify sampleRate — iOS Safari ignores it and defaults to native rate.
    // The AudioContext's sampleRate handles resampling to 24kHz.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    mediaStreamRef.current = stream;

    // Create a dedicated AudioContext for input (separate from output).
    // Using separate contexts avoids iOS "playAndRecord" session mode
    // that degrades speaker volume and audio quality.
    // Reuse existing context if available (iOS limits AudioContext count).
    let audioContext = audioContextRef.current;
    if (audioContext === null || audioContext.state === "closed") {
      audioContext = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = audioContext;
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // Create source from microphone stream
    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNodeRef.current = sourceNode;

    // Create ScriptProcessorNode for audio processing
    // (deprecated but widely supported; acceptable for MVP)
    const processorNode = audioContext.createScriptProcessor(
      AUDIO_BUFFER_SIZE,
      1, // input channels
      1, // output channels
    );
    processorNodeRef.current = processorNode;

    processorNode.onaudioprocess = (event: AudioProcessingEvent): void => {
      const inputData = event.inputBuffer.getChannelData(0);

      // Zero the output buffer to prevent mic audio from playing through speakers.
      // Without this, some browsers pass input through to output (causing feedback).
      event.outputBuffer.getChannelData(0).fill(0);

      // Calculate RMS level for visualisation
      const rms = calculateRms(inputData);
      setAudioLevel(rms);

      // Convert Float32 -> PCM16 -> base64 and deliver
      const pcm16Buffer = float32ToPcm16(inputData);
      const base64 = arrayBufferToBase64(pcm16Buffer);
      onAudioChunkRef.current(base64, rms);
    };

    // Connect the processing graph: microphone -> processor -> destination
    // The destination connection is required for ScriptProcessorNode to fire
    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    capturingRef.current = true;
    setIsCapturing(true);
  }, [releaseResources]);

  const stopCapture = useCallback((): void => {
    releaseResources();
  }, [releaseResources]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      releaseResources();
    };
  }, [releaseResources]);

  return {
    startCapture,
    stopCapture,
    isCapturing,
    audioLevel,
  };
}
