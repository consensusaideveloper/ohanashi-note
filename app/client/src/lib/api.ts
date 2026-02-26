import { getIdToken } from "./auth";

import type {
  TranscriptEntry,
  QuestionCategory,
  NoteEntry,
  KeyPoints,
} from "../types/conversation";

/**
 * Typed API error that carries HTTP status and response body for developer
 * debugging while keeping the user-facing `message` free of technical details.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(status: number, responseBody: string) {
    super("API request failed");
    this.name = "ApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

/**
 * Perform an authenticated fetch request.
 * Automatically attaches the Firebase ID token as a Bearer token.
 * Throws an ApiError if the request fails, or a plain Error if not signed in.
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getIdToken();

  if (token === null) {
    throw new Error("認証されていません。ログインしてください。");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (!headers.has("Content-Type") && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(response.status, text);
  }

  return response;
}

export interface SummarizeResult {
  summary: string;
  coveredQuestionIds: string[];
  noteEntries: NoteEntry[];
  extractedUserName?: string | null;
  oneLinerSummary: string;
  emotionAnalysis: string;
  discussedCategories: string[];
  keyPoints: KeyPoints;
  topicAdherence: "high" | "medium" | "low";
  offTopicSummary: string;
}

// --- Audio URL endpoints ---

interface AudioDownloadUrlResponse {
  downloadUrl: string;
}

export async function getAudioDownloadUrl(
  conversationId: string,
): Promise<AudioDownloadUrlResponse> {
  const response = await fetchWithAuth(
    `/api/conversations/${conversationId}/audio-url`,
  );
  return response.json() as Promise<AudioDownloadUrlResponse>;
}

// --- Summarize ---

export async function requestSummarize(
  category: QuestionCategory | null,
  transcript: TranscriptEntry[],
  previousNoteEntries?: NoteEntry[],
): Promise<SummarizeResult> {
  const payload: Record<string, unknown> = {
    category,
    transcript: transcript.map((t) => ({ role: t.role, text: t.text })),
  };
  if (previousNoteEntries !== undefined && previousNoteEntries.length > 0) {
    payload["previousNoteEntries"] = previousNoteEntries;
  }

  const response = await fetchWithAuth("/api/summarize", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.json() as Promise<SummarizeResult>;
}
