// OpenAI Realtime API WebSocket relay service.
// Bridges a browser client WSContext to the OpenAI Realtime API,
// sanitizing sensitive text content in transit.

import WebSocket from "ws";

import { logger } from "../lib/logger.js";
import { sanitizeText } from "./sanitizer.js";

import type { WSContext } from "hono/ws";

// --- Constants ---

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini";

// --- Types ---

interface RelayConfig {
  apiKey: string;
}

interface RelaySession {
  closeRelay(): void;
  forwardClientMessage(data: string): void;
}

/** Shape of an OpenAI Realtime API error event (server-to-client). */
interface OpenAIErrorEvent {
  type: "error";
  error: {
    type: string;
    code: string;
    message: string;
  };
}

/** Maximum number of client messages buffered while the OpenAI WebSocket is connecting.
 *  Prevents unbounded memory growth if OpenAI never connects. */
const MAX_PENDING_BUFFER_SIZE = 256;

// Fields we sanitize in client-to-OpenAI JSON messages
const TEXT_FIELDS_TO_SANITIZE = new Set([
  "text",
  "instructions",
  "transcript",
  "input",
]);

// --- Helpers ---

/**
 * Recursively sanitize string values in known text fields of a parsed JSON object.
 */
function sanitizeMessageFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeMessageFields(item));
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (typeof value === "string" && TEXT_FIELDS_TO_SANITIZE.has(key)) {
        result[key] = sanitizeText(value);
      } else {
        result[key] = sanitizeMessageFields(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Sanitize a raw client message string. If the message is valid JSON with
 * text fields, sanitize those fields. Otherwise return the original string.
 */
function sanitizeClientMessage(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    const sanitized = sanitizeMessageFields(parsed);
    return JSON.stringify(sanitized);
  } catch {
    // Not valid JSON; return as-is (could be binary frame misrouted, etc.)
    return raw;
  }
}

/**
 * Check if a parsed message is an OpenAI error event.
 */
function isOpenAIErrorEvent(data: unknown): data is OpenAIErrorEvent {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  if (record.type !== "error") return false;
  const error = record.error;
  if (typeof error !== "object" || error === null) return false;
  const errorRecord = error as Record<string, unknown>;
  return (
    typeof errorRecord.type === "string" &&
    typeof errorRecord.code === "string" &&
    typeof errorRecord.message === "string"
  );
}

// --- Relay factory ---

/**
 * Create a relay session that bridges a browser WebSocket (WSContext) to the
 * OpenAI Realtime API. The relay:
 * - Opens a WS connection to OpenAI on creation
 * - Forwards sanitized client messages to OpenAI
 * - Forwards OpenAI messages to the client as-is
 * - Cleans up both sides on disconnect
 */
function createRelay(clientWs: WSContext, config: RelayConfig): RelaySession {
  let closed = false;
  const pendingMessages: string[] = [];

  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  function cleanup(): void {
    if (closed) {
      return;
    }
    closed = true;
    pendingMessages.length = 0;

    // Close the OpenAI WebSocket if still open
    if (
      openaiWs.readyState === WebSocket.OPEN ||
      openaiWs.readyState === WebSocket.CONNECTING
    ) {
      try {
        openaiWs.close(1000, "Client disconnected");
      } catch (err: unknown) {
        logger.warn("Error closing OpenAI WebSocket", {
          error: String(err),
        });
      }
    }

    // Close the client WebSocket if still open
    if (clientWs.readyState === 1 /* OPEN */) {
      try {
        clientWs.close(1000, "Relay closed");
      } catch (err: unknown) {
        logger.warn("Error closing client WebSocket", {
          error: String(err),
        });
      }
    }

    logger.info("Relay session cleaned up");
  }

  // --- OpenAI WebSocket event handlers ---

  openaiWs.on("open", () => {
    logger.info("Connected to OpenAI Realtime API", {
      bufferedMessages: pendingMessages.length,
    });

    // Flush any messages that arrived while the connection was being established
    for (const message of pendingMessages) {
      try {
        openaiWs.send(message);
      } catch (err: unknown) {
        logger.error("Error flushing buffered message to OpenAI", {
          error: String(err),
        });
      }
    }
    pendingMessages.length = 0;
  });

  openaiWs.on("message", (data: WebSocket.RawData) => {
    if (closed) {
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const message = typeof data === "string" ? data : data.toString("utf-8");

      // Detect and log OpenAI error events for server-side observability
      try {
        const parsed: unknown = JSON.parse(message);
        if (isOpenAIErrorEvent(parsed)) {
          logger.error("OpenAI Realtime API error event", {
            errorType: parsed.error.type,
            errorCode: parsed.error.code,
            errorMessage: parsed.error.message,
          });
        }
      } catch {
        // Not valid JSON — skip error detection (message is still forwarded)
      }

      // Forward OpenAI messages to the client as-is
      if (clientWs.readyState === 1 /* OPEN */) {
        clientWs.send(message);
      }
    } catch (err: unknown) {
      logger.error("Error forwarding OpenAI message to client", {
        error: String(err),
      });
    }
  });

  openaiWs.on("close", (code: number, reason: Buffer) => {
    logger.info("OpenAI WebSocket closed", {
      code,
      reason: reason.toString("utf-8"),
    });
    cleanup();
  });

  openaiWs.on("error", (err: Error) => {
    logger.error("OpenAI WebSocket error", {
      error: err.message,
    });
    cleanup();
  });

  // --- Public interface ---

  return {
    closeRelay(): void {
      cleanup();
    },

    forwardClientMessage(data: string): void {
      if (closed) {
        logger.warn("Attempted to forward message on closed relay");
        return;
      }

      const sanitized = sanitizeClientMessage(data);

      if (openaiWs.readyState === WebSocket.CONNECTING) {
        if (pendingMessages.length < MAX_PENDING_BUFFER_SIZE) {
          pendingMessages.push(sanitized);
        } else {
          logger.warn("Pending message buffer full, dropping message", {
            bufferSize: pendingMessages.length,
          });
        }
        return;
      }

      if (openaiWs.readyState !== WebSocket.OPEN) {
        logger.warn("OpenAI WebSocket not open, cannot forward message", {
          readyState: openaiWs.readyState,
        });
        return;
      }

      try {
        openaiWs.send(sanitized);
      } catch (err: unknown) {
        logger.error("Error forwarding client message to OpenAI", {
          error: String(err),
        });
      }
    },
  };
}

export { createRelay };
export type { RelaySession, RelayConfig };
