import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUDIO_DEFAULT_RATE_INDEX,
  AUDIO_PLAYBACK_RATE_OPTIONS,
  AUDIO_SKIP_SECONDS,
} from "../lib/constants";

interface UseAudioPlayerReturn {
  /** Ref to attach to the hidden <audio> element. */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Current playback position in seconds. */
  currentTime: number;
  /** Total duration in seconds (0 until metadata loads). */
  duration: number;
  /** Whether audio metadata has loaded and playback is possible. */
  isReady: boolean;
  /** Current playback rate (e.g. 0.75, 1, 1.25). */
  playbackRate: number;
  /** Toggle between play and pause. */
  togglePlayback: () => void;
  /** Seek to a specific time in seconds. */
  seekTo: (time: number) => void;
  /** Skip forward by AUDIO_SKIP_SECONDS. */
  skipForward: () => void;
  /** Skip backward by AUDIO_SKIP_SECONDS. */
  skipBackward: () => void;
  /** Cycle to the next playback rate option. */
  cyclePlaybackRate: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [rateIndex, setRateIndex] = useState(AUDIO_DEFAULT_RATE_INDEX);

  const playbackRate = AUDIO_PLAYBACK_RATE_OPTIONS[rateIndex] ?? 1;

  // Sync playbackRate to the audio element whenever it changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio !== null) {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Attach and clean up audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return;

    const handleLoadedMetadata = (): void => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsReady(true);
    };

    const handleTimeUpdate = (): void => {
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = (): void => {
      setIsPlaying(true);
    };

    const handlePause = (): void => {
      setIsPlaying(false);
    };

    const handleEnded = (): void => {
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    // If metadata is already loaded (e.g. cached), sync immediately
    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlayback = useCallback((): void => {
    const audio = audioRef.current;
    if (audio === null) return;

    if (audio.paused) {
      audio.play().catch((error: unknown) => {
        console.error("Audio playback failed:", error);
      });
    } else {
      audio.pause();
    }
  }, []);

  const seekTo = useCallback((time: number): void => {
    const audio = audioRef.current;
    if (audio === null) return;

    const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const clamped = Math.max(0, Math.min(time, audioDuration));
    if (!Number.isFinite(clamped)) return;
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const skipForward = useCallback((): void => {
    const audio = audioRef.current;
    if (audio === null) return;

    const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const target = Math.min(
      audio.currentTime + AUDIO_SKIP_SECONDS,
      audioDuration,
    );
    if (!Number.isFinite(target)) return;
    audio.currentTime = target;
    setCurrentTime(target);
  }, []);

  const skipBackward = useCallback((): void => {
    const audio = audioRef.current;
    if (audio === null) return;

    const target = Math.max(audio.currentTime - AUDIO_SKIP_SECONDS, 0);
    if (!Number.isFinite(target)) return;
    audio.currentTime = target;
    setCurrentTime(target);
  }, []);

  const cyclePlaybackRate = useCallback((): void => {
    setRateIndex((prev) => (prev + 1) % AUDIO_PLAYBACK_RATE_OPTIONS.length);
  }, []);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    isReady,
    playbackRate,
    togglePlayback,
    seekTo,
    skipForward,
    skipBackward,
    cyclePlaybackRate,
  };
}
