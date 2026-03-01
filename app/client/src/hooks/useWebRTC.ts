import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DataChannelClientEvent,
  DataChannelServerEvent,
} from "../lib/realtime-protocol";

// --- Constants ---

const DATA_CHANNEL_NAME = "oai-events";

/** Interval for mic audio level analysis (roughly 60fps). */
const AUDIO_LEVEL_INTERVAL_MS = 16;

/** Size of the AnalyserNode FFT for mic level detection. */
const ANALYSER_FFT_SIZE = 256;

// --- Types ---

type WebRTCStatus = "disconnected" | "connecting" | "connected" | "failed";

type MessageHandler = (event: DataChannelServerEvent) => void;

/** Callback that sends the SDP offer to a server and returns the answer SDP. */
type SdpExchangeFn = (offerSdp: string) => Promise<string>;

interface UseWebRTCReturn {
  /** Request microphone access. Call this first in a user gesture handler. */
  requestMicAccess: () => Promise<MediaStream>;
  /** Establish WebRTC connection. exchangeSdp sends the offer to our server and returns the answer. */
  connect: (
    micStream: MediaStream,
    exchangeSdp: SdpExchangeFn,
  ) => Promise<void>;
  /** Close the connection and release all resources. */
  disconnect: () => void;
  /** Send an event through the data channel. */
  send: (event: DataChannelClientEvent) => void;
  /** Current connection status. */
  status: WebRTCStatus;
  /** Mic audio level [0.0, 1.0] for UI visualisation. */
  audioLevel: number;
  /** Register a handler for incoming data channel events. */
  addMessageHandler: (handler: MessageHandler) => void;
  /** Unregister a handler. */
  removeMessageHandler: (handler: MessageHandler) => void;
}

interface ReleaseResourcesOptions {
  /** Keep this stream alive while cleaning previous connection resources. */
  preserveMicStream?: MediaStream;
}

/**
 * WebRTC connection hook for the OpenAI Realtime API.
 *
 * Replaces the WebSocket relay architecture with a direct peer connection
 * to OpenAI. Audio flows through native WebRTC media tracks (no PCM16
 * encoding/decoding needed). Events are sent/received via a data channel
 * named "oai-events".
 *
 * The hook provides mic level analysis using an AnalyserNode that reads
 * from the local mic stream without interfering with WebRTC audio.
 */
export function useWebRTC(): UseWebRTCReturn {
  const [status, setStatus] = useState<WebRTCStatus>("disconnected");
  const [audioLevel, setAudioLevel] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  // Mic level analysis refs
  const analyserContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addMessageHandler = useCallback((handler: MessageHandler): void => {
    handlersRef.current.add(handler);
  }, []);

  const removeMessageHandler = useCallback((handler: MessageHandler): void => {
    handlersRef.current.delete(handler);
  }, []);

  const send = useCallback((event: DataChannelClientEvent): void => {
    const dc = dataChannelRef.current;
    if (dc === null || dc.readyState !== "open") {
      return;
    }
    dc.send(JSON.stringify(event));
  }, []);

  /** Start mic audio level monitoring via AnalyserNode. */
  const startAudioLevelMonitor = useCallback((stream: MediaStream): void => {
    try {
      const ctx = new AudioContext();
      analyserContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserSourceRef.current = source;

      const dataArray = new Uint8Array(analyser.fftSize);

      levelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);
        // Calculate RMS from time-domain data (values centered at 128)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const sample = ((dataArray[i] ?? 128) - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(rms);
      }, AUDIO_LEVEL_INTERVAL_MS);
    } catch {
      // Audio level monitoring is non-critical; ignore errors
    }
  }, []);

  /** Stop mic audio level monitoring. */
  const stopAudioLevelMonitor = useCallback((): void => {
    if (levelTimerRef.current !== null) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    if (analyserSourceRef.current !== null) {
      analyserSourceRef.current.disconnect();
      analyserSourceRef.current = null;
    }
    analyserRef.current = null;
    if (analyserContextRef.current !== null) {
      analyserContextRef.current.close().catch(() => {});
      analyserContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  /** Request microphone access. Must be called from a user gesture handler. */
  const requestMicAccess = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    micStreamRef.current = stream;
    return stream;
  }, []);

  /** Release all WebRTC resources. */
  const releaseResources = useCallback(
    (options: ReleaseResourcesOptions = {}): void => {
      const { preserveMicStream } = options;

      stopAudioLevelMonitor();

      // Stop mic stream tracks
      const micStream = micStreamRef.current;
      if (micStream !== null && micStream !== preserveMicStream) {
        for (const track of micStream.getTracks()) {
          track.stop();
        }
      }
      if (micStream !== preserveMicStream) {
        micStreamRef.current = null;
      }

      // Release audio element
      const audioEl = audioElementRef.current;
      if (audioEl !== null) {
        audioEl.srcObject = null;
        audioElementRef.current = null;
      }

      // Close data channel
      const dc = dataChannelRef.current;
      if (dc !== null) {
        dc.close();
        dataChannelRef.current = null;
      }

      // Close peer connection
      const pc = peerConnectionRef.current;
      if (pc !== null) {
        pc.close();
        peerConnectionRef.current = null;
      }
    },
    [stopAudioLevelMonitor],
  );

  const disconnect = useCallback((): void => {
    releaseResources();
    setStatus("disconnected");
  }, [releaseResources]);

  const connect = useCallback(
    async (
      micStream: MediaStream,
      exchangeSdp: SdpExchangeFn,
    ): Promise<void> => {
      // Clean up any existing connection
      releaseResources({ preserveMicStream: micStream });
      setStatus("connecting");

      try {
        micStreamRef.current = micStream;

        // Create peer connection
        const pc = new RTCPeerConnection();
        peerConnectionRef.current = pc;

        // Add mic audio track
        const audioTrack = micStream.getAudioTracks()[0];
        if (audioTrack === undefined || audioTrack.readyState !== "live") {
          throw new Error("マイクの音声トラックが利用できません");
        }
        pc.addTrack(audioTrack, micStream);

        // Create data channel for events
        const dc = pc.createDataChannel(DATA_CHANNEL_NAME);
        dataChannelRef.current = dc;

        // Handle incoming remote audio track (AI voice)
        pc.ontrack = (event: RTCTrackEvent): void => {
          const remoteStream = event.streams[0];
          if (remoteStream !== undefined) {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.autoplay = true;
            audioElementRef.current = audio;
            // Play explicitly for iOS Safari autoplay policy
            audio.play().catch(() => {});
          }
        };

        // Data channel event handling
        dc.onopen = (): void => {
          setStatus("connected");
        };

        dc.onmessage = (event: MessageEvent): void => {
          try {
            const data: unknown = JSON.parse(String(event.data));
            if (
              typeof data === "object" &&
              data !== null &&
              "type" in data &&
              typeof (data as { type: unknown }).type === "string"
            ) {
              const serverEvent = data as DataChannelServerEvent;
              for (const handler of handlersRef.current) {
                handler(serverEvent);
              }
            }
          } catch (parseError: unknown) {
            const RAW_DATA_LOG_LIMIT = 200;
            console.error("Failed to parse data channel message:", {
              error: parseError,
              rawData:
                typeof event.data === "string"
                  ? event.data.slice(0, RAW_DATA_LOG_LIMIT)
                  : "(non-string data)",
            });
          }
        };

        dc.onerror = (): void => {
          setStatus("failed");
        };

        // Handle peer connection state changes
        pc.onconnectionstatechange = (): void => {
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setStatus("failed");
          }
        };

        // Create SDP offer and exchange via our server
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (offer.sdp === undefined) {
          throw new Error("SDP offerの作成に失敗しました");
        }

        const answerSdp = await exchangeSdp(offer.sdp);
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        // Start mic audio level monitoring for UI
        startAudioLevelMonitor(micStream);
      } catch (err: unknown) {
        console.error("WebRTC connection failed:", {
          error: err instanceof Error ? err.message : String(err),
        });
        releaseResources();
        setStatus("failed");
      }
    },
    [releaseResources, startAudioLevelMonitor],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      releaseResources();
    };
  }, [releaseResources]);

  return {
    requestMicAccess,
    connect,
    disconnect,
    send,
    status,
    audioLevel,
    addMessageHandler,
    removeMessageHandler,
  };
}
