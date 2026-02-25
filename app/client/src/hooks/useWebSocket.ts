import { useCallback, useEffect, useRef, useState } from "react";

import {
  WS_URL,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from "../lib/constants";

import type { ClientEvent, ServerEvent } from "../lib/websocket-protocol";
import type { WebSocketStatus } from "../types/conversation";

/** Handler invoked when a parsed ServerEvent is received. */
type MessageHandler = (event: ServerEvent) => void;

interface UseWebSocketReturn {
  /** Open the WebSocket connection. */
  connect: () => void;
  /** Close the WebSocket connection (no auto-reconnect). */
  disconnect: () => void;
  /** Send a client event to the server. */
  send: (event: ClientEvent) => void;
  /** Current connection status. */
  status: WebSocketStatus;
  /** Last error message, if any. */
  lastError: string | null;
  /** Register a handler for incoming server events. */
  addMessageHandler: (handler: MessageHandler) => void;
  /** Unregister a previously registered handler. */
  removeMessageHandler: (handler: MessageHandler) => void;
}

/**
 * WebSocket connection management hook.
 *
 * Connects to WS_URL from constants, supports auto-reconnect with
 * exponential backoff, and delivers parsed ServerEvent objects to
 * registered message handlers.
 */
export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When true, no auto-reconnect after close
  const intentionalCloseRef = useRef(false);
  // Prevent connecting while already connecting or connected
  const isConnectingRef = useRef(false);

  const clearReconnectTimer = useCallback((): void => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const addMessageHandler = useCallback((handler: MessageHandler): void => {
    handlersRef.current.add(handler);
  }, []);

  const removeMessageHandler = useCallback((handler: MessageHandler): void => {
    handlersRef.current.delete(handler);
  }, []);

  const send = useCallback((event: ClientEvent): void => {
    const ws = wsRef.current;
    if (ws === null || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(event));
  }, []);

  const connectInternal = useCallback((): void => {
    // Guard against duplicate connections
    if (isConnectingRef.current) {
      return;
    }
    const existingWs = wsRef.current;
    if (
      existingWs !== null &&
      (existingWs.readyState === WebSocket.OPEN ||
        existingWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    isConnectingRef.current = true;
    clearReconnectTimer();

    const isReconnect = reconnectAttemptRef.current > 0;
    setStatus(isReconnect ? "reconnecting" : "connecting");
    setLastError(null);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      isConnectingRef.current = false;
      reconnectAttemptRef.current = 0;
      setStatus("connected");
    });

    ws.addEventListener("message", (messageEvent: MessageEvent) => {
      try {
        const data: unknown = JSON.parse(String(messageEvent.data));
        // Minimal shape check: must be an object with a string `type` field
        if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          typeof (data as { type: unknown }).type === "string"
        ) {
          const serverEvent = data as ServerEvent;
          for (const handler of handlersRef.current) {
            handler(serverEvent);
          }
        }
      } catch {
        // Silently ignore malformed messages
      }
    });

    ws.addEventListener("error", () => {
      isConnectingRef.current = false;
      setLastError("WebSocket connection error");
    });

    ws.addEventListener("close", () => {
      isConnectingRef.current = false;
      wsRef.current = null;

      if (intentionalCloseRef.current) {
        setStatus("disconnected");
        return;
      }

      // Auto-reconnect with exponential backoff
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current = attempt + 1;
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
          RECONNECT_MAX_DELAY_MS,
        );
        setStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(() => {
          connectInternal();
        }, delay);
      } else {
        setStatus("failed");
        setLastError("Maximum reconnection attempts reached");
      }
    });
  }, [clearReconnectTimer]);

  const connect = useCallback((): void => {
    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    connectInternal();
  }, [connectInternal]);

  const disconnect = useCallback((): void => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;

    const ws = wsRef.current;
    if (ws !== null) {
      ws.close();
      wsRef.current = null;
    }
    isConnectingRef.current = false;
    setStatus("disconnected");
  }, [clearReconnectTimer]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      if (ws !== null) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimer]);

  return {
    connect,
    disconnect,
    send,
    status,
    lastError,
    addMessageHandler,
    removeMessageHandler,
  };
}
