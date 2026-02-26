import { getIdToken } from "./auth";

import type {
  TranscriptEntry,
  QuestionCategory,
  NoteEntry,
  KeyPoints,
} from "../types/conversation";

/**
 * Perform an authenticated fetch request.
 * Automatically attaches the Firebase ID token as a Bearer token.
 * Throws an Error if the user is not signed in or the request fails.
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
    throw new Error(`API error ${response.status}: ${text}`);
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

interface AudioUploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
}

interface AudioDownloadUrlResponse {
  downloadUrl: string;
}

export async function getAudioUploadUrl(
  conversationId: string,
  mimeType: string,
): Promise<AudioUploadUrlResponse> {
  const response = await fetchWithAuth(
    `/api/conversations/${conversationId}/audio-url`,
    {
      method: "POST",
      body: JSON.stringify({ mimeType }),
    },
  );
  return response.json() as Promise<AudioUploadUrlResponse>;
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
