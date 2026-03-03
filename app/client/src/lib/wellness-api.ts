import { fetchWithAuth } from "./api";

// --- Types ---

export interface ActivityTrendEntry {
  date: string;
  hadConversation: boolean;
  summary: string | null;
}

export interface WellnessSettings {
  enabled: boolean;
  frequency: "daily" | "every_2_days" | "every_3_days";
  sharingLevel: "activity_only" | "activity_and_summary";
  enabledAt: string | null;
  hasFamilyMembers: boolean;
}

export interface UpdateWellnessSettingsRequest {
  enabled: boolean;
  frequency: "daily" | "every_2_days" | "every_3_days";
  sharingLevel: "activity_only" | "activity_and_summary";
}

export interface WellnessDashboard {
  enabled: boolean;
  lastConversationDate: string | null;
  currentStreak: number;
  isInactive: boolean;
  inactiveDays: number;
  frequency: string;
  activityTrend: ActivityTrendEntry[];
  lifecycleNotActive?: boolean;
}

export interface WellnessHistoryRecord {
  date: string;
  hadConversation: boolean;
  summary: string | null;
}

export interface WellnessHistoryResponse {
  records: WellnessHistoryRecord[];
  total: number;
  limit?: number;
  offset?: number;
}

// --- API Functions ---

export async function getWellnessSettings(): Promise<WellnessSettings> {
  const response = await fetchWithAuth("/api/wellness/settings");
  return response.json() as Promise<WellnessSettings>;
}

export async function updateWellnessSettings(
  data: UpdateWellnessSettingsRequest,
): Promise<WellnessSettings> {
  const response = await fetchWithAuth("/api/wellness/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return response.json() as Promise<WellnessSettings>;
}

export async function getWellnessPreview(): Promise<WellnessDashboard> {
  const response = await fetchWithAuth("/api/wellness/preview");
  return response.json() as Promise<WellnessDashboard>;
}

export async function getWellnessDashboard(
  creatorId: string,
): Promise<WellnessDashboard> {
  const response = await fetchWithAuth(`/api/wellness/${creatorId}/dashboard`);
  return response.json() as Promise<WellnessDashboard>;
}

export async function getWellnessHistory(
  creatorId: string,
  limit?: number,
  offset?: number,
): Promise<WellnessHistoryResponse> {
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }
  if (offset !== undefined) {
    params.set("offset", String(offset));
  }
  const query = params.toString();
  const path = `/api/wellness/${creatorId}/history${query !== "" ? `?${query}` : ""}`;
  const response = await fetchWithAuth(path);
  return response.json() as Promise<WellnessHistoryResponse>;
}
