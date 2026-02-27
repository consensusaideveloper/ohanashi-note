import { PENDING_INVITE_STORAGE_KEY } from "./constants";

/**
 * Save an invitation token to localStorage when the user defers acceptance.
 * On next app load, AuthGate will detect it and show the invitation screen.
 */
export function savePendingInviteToken(token: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_STORAGE_KEY, token);
  } catch {
    // localStorage unavailable (private browsing, quota exceeded) — silent fallback
  }
}

/**
 * Retrieve a previously deferred invitation token from localStorage.
 * Returns null if none is stored.
 */
export function getPendingInviteToken(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear the pending invitation token from localStorage.
 * Called after acceptance, expiration, or any terminal invitation state.
 */
export function clearPendingInviteToken(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  } catch {
    // Silent fallback
  }
}
