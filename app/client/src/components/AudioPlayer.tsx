import { useCallback, type ReactNode } from "react";

import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { AUDIO_KEYBOARD_SEEK_STEP, UI_MESSAGES } from "../lib/constants";

interface AudioPlayerProps {
  /** Blob URL or HTTP URL for the audio source. */
  src: string;
  /** Accessible label for the player region. */
  ariaLabel?: string;
}

/** Format seconds as M:SS or H:MM:SS. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const paddedS = s.toString().padStart(2, "0");

  if (h > 0) {
    const paddedM = m.toString().padStart(2, "0");
    return `${h}:${paddedM}:${paddedS}`;
  }
  return `${m}:${paddedS}`;
}

export function AudioPlayer({ src, ariaLabel }: AudioPlayerProps): ReactNode {
  const {
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
  } = useAudioPlayer();

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (duration <= 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const ratio = Math.max(0, Math.min(x / rect.width, 1));
      seekTo(ratio * duration);
    },
    [duration, seekTo],
  );

  const handleProgressKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekTo(Math.min(currentTime + AUDIO_KEYBOARD_SEEK_STEP, duration));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekTo(Math.max(currentTime - AUDIO_KEYBOARD_SEEK_STEP, 0));
      }
    },
    [currentTime, duration, seekTo],
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? UI_MESSAGES.audio.playerLabel}
      className="rounded-card bg-bg-surface border border-border p-4"
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata">
        <track kind="captions" />
      </audio>

      {/* Progress bar */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={UI_MESSAGES.audio.seekPosition}
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
        className="relative min-h-11 flex items-center cursor-pointer"
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
      >
        {/* Track background */}
        <div className="w-full h-3 rounded-full bg-border overflow-hidden">
          {/* Filled portion */}
          <div
            className="h-full bg-accent-primary rounded-full transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Time display */}
      <div className="flex justify-between mt-1 px-1">
        <span className="text-lg text-text-secondary tabular-nums">
          {formatTime(currentTime)}
        </span>
        <span className="text-lg text-text-secondary tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-3">
        {/* Skip backward */}
        <button
          type="button"
          onClick={skipBackward}
          disabled={!isReady}
          aria-label={UI_MESSAGES.audio.skipBackward}
          className="min-h-11 min-w-11 flex flex-col items-center justify-center rounded-full bg-bg-surface-hover text-text-primary active:bg-border transition-colors disabled:opacity-40 p-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"
            />
          </svg>
          <span className="text-xs font-bold leading-none" aria-hidden="true">
            10
          </span>
        </button>

        {/* Play / Pause */}
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!isReady}
          aria-label={
            isPlaying ? UI_MESSAGES.audio.pause : UI_MESSAGES.audio.play
          }
          className="min-h-14 min-w-14 flex items-center justify-center rounded-full bg-accent-primary text-text-on-accent shadow-lg active:scale-95 transition-transform disabled:opacity-40"
        >
          {isPlaying ? (
            /* Pause icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            /* Play icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
            </svg>
          )}
        </button>

        {/* Skip forward */}
        <button
          type="button"
          onClick={skipForward}
          disabled={!isReady}
          aria-label={UI_MESSAGES.audio.skipForward}
          className="min-h-11 min-w-11 flex flex-col items-center justify-center rounded-full bg-bg-surface-hover text-text-primary active:bg-border transition-colors disabled:opacity-40 p-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
            />
          </svg>
          <span className="text-xs font-bold leading-none" aria-hidden="true">
            10
          </span>
        </button>
      </div>

      {/* Playback speed */}
      <div className="flex justify-center mt-2">
        <button
          type="button"
          onClick={cyclePlaybackRate}
          disabled={!isReady}
          aria-label={`${UI_MESSAGES.audio.playbackSpeed} ${playbackRate}x`}
          className="min-h-11 px-4 rounded-full bg-bg-surface-hover text-text-secondary text-lg font-medium active:bg-border transition-colors disabled:opacity-40"
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
