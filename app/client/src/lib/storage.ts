import { fetchWithAuth, getAudioUploadUrl, getAudioDownloadUrl } from "./api";
import { getQuestionsByCategory } from "./questions";

import type {
  AudioRecording,
  ConversationRecord,
  QuestionCategory,
  NoteEntry,
  UserProfile,
} from "../types/conversation";

// --- Server response types ---

/** Conversation shape as returned by the server API. */
interface ServerConversation {
  id: string;
  category: string | null;
  characterId: string | null;
  startedAt: number;
  endedAt: number | null;
  transcript: unknown;
  summary: string | null;
  summaryStatus: string;
  coveredQuestionIds: string[] | null;
  noteEntries: unknown;
  oneLinerSummary: string | null;
  emotionAnalysis: string | null;
  discussedCategories: string[] | null;
  keyPoints: unknown;
  topicAdherence: string | null;
  offTopicSummary: string | null;
  audioAvailable: boolean;
  audioStorageKey: string | null;
  audioMimeType: string | null;
  integrityHash: string | null;
  audioHash: string | null;
  integrityHashedAt: number | null;
}

/** Convert a server response to a ConversationRecord. */
function toConversationRecord(s: ServerConversation): ConversationRecord {
  return {
    id: s.id,
    category: s.category as ConversationRecord["category"],
    characterId: s.characterId as ConversationRecord["characterId"],
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    transcript: Array.isArray(s.transcript)
      ? (s.transcript as ConversationRecord["transcript"])
      : [],
    summary: s.summary,
    summaryStatus:
      (s.summaryStatus as ConversationRecord["summaryStatus"]) ?? "pending",
    coveredQuestionIds: s.coveredQuestionIds ?? [],
    noteEntries: Array.isArray(s.noteEntries)
      ? (s.noteEntries as NoteEntry[])
      : [],
    oneLinerSummary: s.oneLinerSummary ?? undefined,
    emotionAnalysis: s.emotionAnalysis ?? undefined,
    discussedCategories:
      (s.discussedCategories as ConversationRecord["discussedCategories"]) ??
      [],
    keyPoints: (s.keyPoints as ConversationRecord["keyPoints"]) ?? undefined,
    topicAdherence:
      (s.topicAdherence as ConversationRecord["topicAdherence"]) ?? undefined,
    offTopicSummary: s.offTopicSummary ?? undefined,
    audioAvailable: s.audioAvailable,
    integrityHash: s.integrityHash ?? undefined,
    audioHash: s.audioHash ?? undefined,
    integrityHashedAt: s.integrityHashedAt ?? undefined,
  };
}

// --- Conversation CRUD ---

export async function saveConversation(
  record: ConversationRecord,
): Promise<void> {
  await fetchWithAuth("/api/conversations", {
    method: "POST",
    body: JSON.stringify(record),
  });
}

export async function updateConversation(
  id: string,
  updates: Partial<ConversationRecord>,
): Promise<void> {
  await fetchWithAuth(`/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function getConversation(
  id: string,
): Promise<ConversationRecord | null> {
  try {
    const response = await fetchWithAuth(`/api/conversations/${id}`);
    const data = (await response.json()) as ServerConversation;
    return toConversationRecord(data);
  } catch (error) {
    // 404 means not found — return null
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    throw error;
  }
}

export async function listConversations(): Promise<ConversationRecord[]> {
  const response = await fetchWithAuth("/api/conversations");
  const data = (await response.json()) as ServerConversation[];
  return data.map(toConversationRecord);
}

export async function deleteConversation(id: string): Promise<void> {
  await fetchWithAuth(`/api/conversations/${id}`, {
    method: "DELETE",
  });
}

// --- Filtered queries (computed client-side from full list) ---

export async function listConversationsByCategory(
  category: QuestionCategory,
): Promise<ConversationRecord[]> {
  const records = await listConversations();
  return records.filter((r) => r.category === category);
}

export async function getAllCoveredQuestionIds(): Promise<Set<string>> {
  const records = await listConversations();
  const ids = new Set<string>();
  for (const record of records) {
    if (record.coveredQuestionIds) {
      for (const qid of record.coveredQuestionIds) {
        ids.add(qid);
      }
    }
  }
  return ids;
}

export async function getNoteEntriesForCategory(
  category: QuestionCategory,
): Promise<NoteEntry[]> {
  const categoryQuestionIds = new Set(
    getQuestionsByCategory(category).map((q) => q.id),
  );
  const records = await listConversations();
  const entryMap = new Map<string, NoteEntry>();
  // records are newest-first from API; iterate oldest-first so newer overwrites
  const reversed = [...records].reverse();
  for (const record of reversed) {
    if (record.noteEntries) {
      for (const entry of record.noteEntries) {
        if (categoryQuestionIds.has(entry.questionId)) {
          entryMap.set(entry.questionId, entry);
        }
      }
    }
  }
  return Array.from(entryMap.values());
}

// --- Audio recording storage via Cloudflare R2 signed URLs ---

interface AudioUploadResult {
  storageKey: string;
}

/**
 * Upload an audio blob to R2 via a signed URL.
 * Returns the storage key for later retrieval.
 * If R2 is not configured (503), resolves without error (audio simply not saved).
 */
export async function saveAudioRecording(
  conversationId: string,
  blob: Blob,
  mimeType: string,
): Promise<AudioUploadResult | null> {
  console.log("saveAudioRecording called:", {
    conversationId,
    blobSize: blob.size,
    mimeType,
  });

  let uploadResponse;
  try {
    uploadResponse = await getAudioUploadUrl(conversationId, mimeType);
    console.log("Got upload URL response:", uploadResponse);
  } catch (error) {
    console.error("Failed to get upload URL:", error);
    // R2 not configured — skip audio upload silently
    if (error instanceof Error && error.message.includes("503")) {
      console.log("R2 not configured (503), skipping audio upload");
      return null;
    }
    throw error;
  }

  const { uploadUrl, storageKey } = uploadResponse;

  // Upload directly to R2
  console.log("Uploading to R2:", {
    storageKey,
    uploadUrl: uploadUrl.substring(0, 50) + "...",
  });
  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": mimeType },
  });

  console.log("R2 upload response:", {
    status: putResponse.status,
    ok: putResponse.ok,
  });

  if (!putResponse.ok) {
    const errorText = await putResponse.text();
    console.error("R2 upload failed:", {
      status: putResponse.status,
      text: errorText,
    });
    throw new Error(
      `Audio upload failed: ${putResponse.status} ${putResponse.statusText}`,
    );
  }

  console.log("Audio successfully uploaded to R2:", storageKey);
  return { storageKey };
}

/**
 * Download an audio recording from R2 via a signed URL.
 * Returns null if no audio is available or R2 is not configured.
 */
export async function getAudioRecording(
  conversationId: string,
): Promise<AudioRecording | null> {
  let downloadResponse;
  try {
    downloadResponse = await getAudioDownloadUrl(conversationId);
  } catch {
    // No audio available or R2 not configured
    return null;
  }

  const { downloadUrl } = downloadResponse;

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    return null;
  }

  const blob = await response.blob();

  return {
    conversationId,
    blob,
    mimeType: blob.type || "audio/webm",
    createdAt: Date.now(),
  };
}

// --- User profile storage ---

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await fetchWithAuth("/api/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const response = await fetchWithAuth("/api/profile");
    const data = (await response.json()) as UserProfile;
    return data;
  } catch {
    return null;
  }
}

// --- Export / Import ---

interface ExportData {
  version: number;
  exportedAt: number;
  profile: UserProfile | null;
  conversations: ConversationRecord[];
}

export async function exportAllData(): Promise<string> {
  const [allConversations, profile] = await Promise.all([
    listConversations(),
    getUserProfile(),
  ]);

  const data: ExportData = {
    version: 2,
    exportedAt: Date.now(),
    profile,
    conversations: allConversations,
  };

  return JSON.stringify(data);
}

export async function importAllData(json: string): Promise<void> {
  let data: ExportData;
  try {
    data = JSON.parse(json) as ExportData;
  } catch {
    throw new Error("Invalid JSON format");
  }

  if (typeof data.version !== "number" || !Array.isArray(data.conversations)) {
    throw new Error("Invalid backup data format");
  }

  // Import conversations via API
  for (const record of data.conversations) {
    await saveConversation(record);
  }

  // Import profile if present
  if (data.profile !== null) {
    await saveUserProfile(data.profile);
  }
}

export async function clearAllData(): Promise<void> {
  const allConversations = await listConversations();
  for (const record of allConversations) {
    await deleteConversation(record.id);
  }
}
