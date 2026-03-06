import { ApiError, fetchWithAuth, getAudioDownloadUrl } from "./api";
import { getQuestionsByCategory } from "./questions";

import type {
  AudioRecording,
  ConversationRecord,
  NoteUpdateProposalTarget,
  QuestionCategory,
  NoteEntry,
  UserProfile,
} from "../types/conversation";

type UserProfileUpdateListener = (updates: Partial<UserProfile>) => void;
type ConversationUpdateListener = () => void;

const userProfileUpdateListeners = new Set<UserProfileUpdateListener>();
const conversationUpdateListeners = new Set<ConversationUpdateListener>();

function notifyConversationUpdated(): void {
  for (const listener of conversationUpdateListeners) {
    listener();
  }
}

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
  pendingNoteEntries?: unknown;
  noteUpdateProposals?: unknown;
  oneLinerSummary: string | null;
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
    pendingNoteEntries: Array.isArray(s.pendingNoteEntries)
      ? (s.pendingNoteEntries as ConversationRecord["pendingNoteEntries"])
      : [],
    noteUpdateProposals: Array.isArray(s.noteUpdateProposals)
      ? (s.noteUpdateProposals as ConversationRecord["noteUpdateProposals"])
      : [],
    oneLinerSummary: s.oneLinerSummary ?? undefined,
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
  notifyConversationUpdated();
}

export async function updateConversation(
  id: string,
  updates: Partial<ConversationRecord>,
): Promise<void> {
  await fetchWithAuth(`/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  notifyConversationUpdated();
}

export async function applyConversationNoteUpdates(
  id: string,
  targets?: NoteUpdateProposalTarget[],
): Promise<{ success: true; appliedCount: number }> {
  const response = await fetchWithAuth(
    `/api/conversations/${id}/apply-note-updates`,
    {
      method: "POST",
      body: JSON.stringify(targets !== undefined ? { targets } : {}),
    },
  );
  const result = (await response.json()) as {
    success: true;
    appliedCount: number;
  };
  notifyConversationUpdated();
  return result;
}

export async function dismissConversationNoteUpdates(
  id: string,
  targets?: NoteUpdateProposalTarget[],
): Promise<{
  success: true;
  dismissedCount: number;
  clearedAll: boolean;
}> {
  const response = await fetchWithAuth(
    `/api/conversations/${id}/dismiss-note-updates`,
    {
      method: "POST",
      body: JSON.stringify(targets !== undefined ? { targets } : {}),
    },
  );
  const result = (await response.json()) as {
    success: true;
    dismissedCount: number;
    clearedAll: boolean;
  };
  notifyConversationUpdated();
  return result;
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
    if (error instanceof ApiError && error.status === 404) {
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
  notifyConversationUpdated();
}

export function subscribeToConversationUpdates(
  listener: ConversationUpdateListener,
): () => void {
  conversationUpdateListeners.add(listener);
  return () => {
    conversationUpdateListeners.delete(listener);
  };
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
  // New approach: Upload directly to server endpoint
  try {
    const response = await fetchWithAuth(
      `/api/conversations/${conversationId}/audio`,
      {
        method: "POST",
        body: blob,
        headers: {
          "Content-Type": mimeType,
        },
      },
    );

    const result = (await response.json()) as {
      success: boolean;
      storageKey?: string;
      error?: string;
    };

    if (result.success && result.storageKey) {
      return { storageKey: result.storageKey };
    } else {
      throw new Error(result.error ?? "Upload failed");
    }
  } catch (error) {
    // R2 not configured — skip audio upload silently
    if (error instanceof ApiError && error.status === 503) {
      return null;
    }
    console.error("Failed to upload audio:", error);
    throw error;
  }
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

export async function saveUserProfile(
  profile: Partial<UserProfile>,
): Promise<void> {
  await fetchWithAuth("/api/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
  for (const listener of userProfileUpdateListeners) {
    listener(profile);
  }
}

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const response = await fetchWithAuth("/api/profile");
    const data = (await response.json()) as UserProfile;
    return data;
  } catch (error: unknown) {
    console.error("Failed to load user profile:", { error });
    return null;
  }
}

export function subscribeToUserProfileUpdates(
  listener: UserProfileUpdateListener,
): () => void {
  userProfileUpdateListeners.add(listener);
  return () => {
    userProfileUpdateListeners.delete(listener);
  };
}

/** Check whether conversation deletion is blocked by lifecycle status. */
export async function checkDeletionBlocked(): Promise<boolean> {
  const response = await fetchWithAuth("/api/conversations/deletion-status");
  const data = (await response.json()) as {
    blocked: boolean;
    lifecycleStatus: string;
  };
  return data.blocked;
}

export async function clearAllData(): Promise<void> {
  // Pre-check: verify deletion is allowed by lifecycle status
  const blocked = await checkDeletionBlocked();
  if (blocked) {
    throw new Error("ノートが保護されているため、データを削除できません");
  }

  const allConversations = await listConversations();
  const failures: string[] = [];
  for (const record of allConversations) {
    try {
      await deleteConversation(record.id);
    } catch (error: unknown) {
      console.error("Failed to delete conversation:", {
        id: record.id,
        error,
      });
      failures.push(record.id);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Failed to delete ${String(failures.length)} of ${String(allConversations.length)} conversations`,
    );
  }
}

/**
 * Deactivate the authenticated user's account (soft-delete).
 * The account enters a 30-day grace period before permanent deletion.
 * Returns the scheduled deletion date.
 */
export async function deleteAccount(): Promise<{
  scheduledDeletionAt: string;
}> {
  const res = await fetchWithAuth("/api/account", { method: "DELETE" });
  return (await res.json()) as { scheduledDeletionAt: string };
}

/** Account status as returned by the server. */
export interface AccountStatus {
  accountStatus: string;
  deactivatedAt: string | null;
  scheduledDeletionAt: string | null;
}

/** Fetch the account status for the authenticated user. */
export async function getAccountStatus(): Promise<AccountStatus> {
  const res = await fetchWithAuth("/api/account/status");
  return (await res.json()) as AccountStatus;
}

/** Reactivate a deactivated account, cancelling the scheduled deletion. */
export async function reactivateAccount(): Promise<void> {
  await fetchWithAuth("/api/account/reactivate", { method: "POST" });
}
