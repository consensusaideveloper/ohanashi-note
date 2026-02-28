import { fetchWithAuth } from "./api";

export interface FamilyMember {
  id: string;
  memberId: string;
  name: string;
  relationship: string;
  relationshipLabel: string;
  role: "representative" | "member";
  isActive: boolean;
  createdAt: string;
}

export interface FamilyInvitation {
  id: string;
  token: string;
  relationship: string;
  relationshipLabel: string;
  role: "representative" | "member";
  expiresAt: string;
}

export interface InvitationInfo {
  creatorName: string;
  relationship: string;
  relationshipLabel: string;
  role: "representative" | "member";
  expiresAt: string;
}

export interface FamilyConnection {
  id: string;
  creatorId: string;
  creatorName: string;
  relationship: string;
  relationshipLabel: string;
  role: "representative" | "member";
  lifecycleStatus: string;
  hasPendingConsent: boolean;
  hasRepresentative: boolean;
}

export interface FamilyMemberListResponse {
  members: FamilyMember[];
  lifecycleStatus: string;
}

export async function listFamilyMembers(): Promise<FamilyMemberListResponse> {
  const response = await fetchWithAuth("/api/family");
  return response.json() as Promise<FamilyMemberListResponse>;
}

export async function createInvitation(data: {
  relationship: string;
  relationshipLabel: string;
  role?: "representative" | "member";
}): Promise<FamilyInvitation> {
  const response = await fetchWithAuth("/api/family/invite", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json() as Promise<FamilyInvitation>;
}

export async function getInvitationInfo(
  token: string,
): Promise<InvitationInfo> {
  const response = await fetchWithAuth(`/api/family/invite/${token}`);
  return response.json() as Promise<InvitationInfo>;
}

export async function acceptInvitation(token: string): Promise<{
  id: string;
  creatorId: string;
  relationship: string;
  role: string;
}> {
  const response = await fetchWithAuth(`/api/family/invite/${token}/accept`, {
    method: "POST",
  });
  return response.json() as Promise<{
    id: string;
    creatorId: string;
    relationship: string;
    role: string;
  }>;
}

export async function updateFamilyMember(
  id: string,
  data: {
    relationship?: string;
    relationshipLabel?: string;
    role?: "representative" | "member";
  },
): Promise<FamilyMember> {
  const response = await fetchWithAuth(`/api/family/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.json() as Promise<FamilyMember>;
}

export async function deleteFamilyMember(id: string): Promise<void> {
  await fetchWithAuth(`/api/family/${id}`, { method: "DELETE" });
}

export async function leaveFamilyConnection(creatorId: string): Promise<void> {
  await fetchWithAuth(`/api/family/leave/${creatorId}`, { method: "DELETE" });
}

export async function listMyConnections(): Promise<FamilyConnection[]> {
  const response = await fetchWithAuth("/api/family/my-connections");
  return response.json() as Promise<FamilyConnection[]>;
}

// --- Lifecycle API ---

export interface LifecycleState {
  id?: string;
  status: "active" | "death_reported" | "consent_gathering" | "opened";
  deathReportedAt: string | null;
  openedAt: string | null;
  createdAt?: string;
  hasRepresentative: boolean;
}

export async function getLifecycleState(
  creatorId: string,
): Promise<LifecycleState> {
  const response = await fetchWithAuth(`/api/lifecycle/${creatorId}`);
  return response.json() as Promise<LifecycleState>;
}

export async function reportDeath(creatorId: string): Promise<LifecycleState> {
  const response = await fetchWithAuth(
    `/api/lifecycle/${creatorId}/report-death`,
    { method: "POST" },
  );
  return response.json() as Promise<LifecycleState>;
}

export async function cancelDeathReport(
  creatorId: string,
): Promise<LifecycleState> {
  const response = await fetchWithAuth(
    `/api/lifecycle/${creatorId}/cancel-death-report`,
    { method: "POST" },
  );
  return response.json() as Promise<LifecycleState>;
}

export interface ConsentRecord {
  id: string;
  familyMemberId: string;
  memberName?: string;
  consented: boolean | null;
  consentedAt: string | null;
}

export interface ConsentStatus {
  status: string;
  consentRecords: ConsentRecord[];
  totalCount: number;
  consentedCount: number;
  pendingCount: number;
}

export async function initiateConsent(
  creatorId: string,
): Promise<{ lifecycle: LifecycleState; consentCount: number }> {
  const response = await fetchWithAuth(
    `/api/lifecycle/${creatorId}/initiate-consent`,
    { method: "POST" },
  );
  return response.json() as Promise<{
    lifecycle: LifecycleState;
    consentCount: number;
  }>;
}

interface SubmitConsentResult {
  consented: boolean;
  consentedAt: string | null;
  autoOpened: boolean;
}

export async function submitConsent(
  creatorId: string,
  consented: boolean,
): Promise<SubmitConsentResult> {
  const response = await fetchWithAuth(`/api/lifecycle/${creatorId}/consent`, {
    method: "POST",
    body: JSON.stringify({ consented }),
  });
  return response.json() as Promise<SubmitConsentResult>;
}

export async function getConsentStatus(
  creatorId: string,
): Promise<ConsentStatus> {
  const response = await fetchWithAuth(
    `/api/lifecycle/${creatorId}/consent-status`,
  );
  return response.json() as Promise<ConsentStatus>;
}

// --- Notifications API ---

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedCreatorId: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function listNotifications(): Promise<Notification[]> {
  const response = await fetchWithAuth("/api/notifications");
  return response.json() as Promise<Notification[]>;
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetchWithAuth(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchWithAuth("/api/notifications/read-all", { method: "POST" });
}

// --- Category Access API ---

export interface CategoryAccessInfo {
  categories: string[];
  isRepresentative: boolean;
}

export interface AccessMatrixMember {
  memberId: string;
  familyMemberId: string;
  name: string;
  role: string;
  relationshipLabel: string;
  categories: string[];
}

export interface AccessMatrix {
  members: AccessMatrixMember[];
}

export interface FamilyConversation {
  id: string;
  category: string | null;
  startedAt: number;
  summary: string | null;
  oneLinerSummary: string | null;
  noteEntries: unknown[];
  coveredQuestionIds: string[];
  keyPoints: unknown;
}

export interface FamilyConversationDetail {
  id: string;
  category: string | null;
  startedAt: number;
  endedAt: number | null;
  transcript: { role: "user" | "assistant"; text: string; timestamp: number }[];
  summary: string | null;
  summaryStatus: string;
  oneLinerSummary: string | null;
  emotionAnalysis: string | null;
  discussedCategories: string[] | null;
  keyPoints: {
    importantStatements: string[];
    decisions: string[];
    undecidedItems: string[];
  } | null;
  noteEntries: unknown[];
  coveredQuestionIds: string[];
  audioAvailable: boolean;
}

export interface FamilyCategoryNoteResponse {
  categoryId: string;
  conversations: FamilyConversation[];
}

export async function getAccessibleCategories(
  creatorId: string,
): Promise<CategoryAccessInfo> {
  const response = await fetchWithAuth(`/api/access/${creatorId}/categories`);
  return response.json() as Promise<CategoryAccessInfo>;
}

export async function grantCategoryAccess(
  creatorId: string,
  familyMemberId: string,
  categoryId: string,
): Promise<void> {
  await fetchWithAuth(`/api/access/${creatorId}/grant`, {
    method: "POST",
    body: JSON.stringify({ familyMemberId, categoryId }),
  });
}

export async function revokeCategoryAccess(
  creatorId: string,
  familyMemberId: string,
  categoryId: string,
): Promise<void> {
  await fetchWithAuth(`/api/access/${creatorId}/revoke`, {
    method: "DELETE",
    body: JSON.stringify({ familyMemberId, categoryId }),
  });
}

export async function getCategoryNote(
  creatorId: string,
  categoryId: string,
): Promise<FamilyCategoryNoteResponse> {
  const response = await fetchWithAuth(
    `/api/access/${creatorId}/note/${categoryId}`,
  );
  return response.json() as Promise<FamilyCategoryNoteResponse>;
}

export async function getFamilyConversations(
  creatorId: string,
): Promise<FamilyConversation[]> {
  const response = await fetchWithAuth(
    `/api/access/${creatorId}/conversations`,
  );
  const data = (await response.json()) as {
    conversations: FamilyConversation[];
  };
  return data.conversations;
}

export async function getFamilyConversationDetail(
  creatorId: string,
  conversationId: string,
): Promise<FamilyConversationDetail> {
  const response = await fetchWithAuth(
    `/api/access/${creatorId}/conversations/${conversationId}`,
  );
  return response.json() as Promise<FamilyConversationDetail>;
}

export async function getFamilyAudioUrl(
  creatorId: string,
  conversationId: string,
): Promise<{ downloadUrl: string }> {
  const response = await fetchWithAuth(
    `/api/access/${creatorId}/conversations/${conversationId}/audio-url`,
  );
  return response.json() as Promise<{ downloadUrl: string }>;
}

export async function getAccessMatrix(
  creatorId: string,
): Promise<AccessMatrix> {
  const response = await fetchWithAuth(`/api/access/${creatorId}/matrix`);
  return response.json() as Promise<AccessMatrix>;
}

// --- Access Presets API ---

export interface AccessPreset {
  id: string;
  familyMemberId: string;
  memberName: string;
  categoryId: string;
  createdAt: string;
}

export interface AccessPresetRecommendation {
  id: string;
  familyMemberId: string;
  memberName: string;
  categoryId: string;
}

export async function listAccessPresets(): Promise<AccessPreset[]> {
  const response = await fetchWithAuth("/api/access-presets");
  return response.json() as Promise<AccessPreset[]>;
}

export async function createAccessPreset(data: {
  familyMemberId: string;
  categoryId: string;
}): Promise<{ id: string; familyMemberId: string; categoryId: string }> {
  const response = await fetchWithAuth("/api/access-presets", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json() as Promise<{
    id: string;
    familyMemberId: string;
    categoryId: string;
  }>;
}

export async function deleteAccessPreset(id: string): Promise<void> {
  await fetchWithAuth(`/api/access-presets/${id}`, { method: "DELETE" });
}

export async function getAccessPresetRecommendations(
  creatorId: string,
): Promise<AccessPresetRecommendation[]> {
  const response = await fetchWithAuth(
    `/api/access-presets/${creatorId}/recommendations`,
  );
  return response.json() as Promise<AccessPresetRecommendation[]>;
}

// --- Data Deletion Consent API ---

export interface DeletionConsentRecord {
  memberName: string;
  consented: boolean | null;
  consentedAt: string | null;
}

export interface DeletionConsentStatus {
  deletionStatus: string | null;
  records: DeletionConsentRecord[];
  myConsent: {
    consented: boolean | null;
    consentedAt: string | null;
  } | null;
  totalCount: number;
  consentedCount: number;
  allConsented: boolean;
}

/** Initiate data deletion consent process (representative only). */
export async function initiateDataDeletion(creatorId: string): Promise<void> {
  await fetchWithAuth(`/api/lifecycle/${creatorId}/initiate-data-deletion`, {
    method: "POST",
  });
}

/** Submit deletion consent decision. */
export async function submitDeletionConsent(
  creatorId: string,
  consented: boolean,
): Promise<{ consented: boolean; deletionExecuted: boolean }> {
  const response = await fetchWithAuth(
    `/api/lifecycle/${creatorId}/deletion-consent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consented }),
    },
  );
  return response.json() as Promise<{
    consented: boolean;
    deletionExecuted: boolean;
  }>;
}

/** Cancel data deletion process (representative only). */
export async function cancelDataDeletion(creatorId: string): Promise<void> {
  await fetchWithAuth(`/api/lifecycle/${creatorId}/cancel-data-deletion`, {
    method: "POST",
  });
}

/** Get deletion consent status. */
export async function getDeletionConsentStatus(
  creatorId: string,
): Promise<DeletionConsentStatus> {
  const response = await fetchWithAuth(
    `/api/lifecycle/${creatorId}/deletion-consent-status`,
  );
  return response.json() as Promise<DeletionConsentStatus>;
}

// --- Invitation Preview API (public, no auth) ---

export interface InvitationPreview {
  valid: boolean;
  creatorName?: string;
}

/** Fetch invitation preview without authentication (public endpoint). */
export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreview> {
  try {
    const response = await fetch(`/api/public/invite/${token}/preview`);
    if (!response.ok) {
      return { valid: false };
    }
    return (await response.json()) as InvitationPreview;
  } catch {
    return { valid: false };
  }
}
