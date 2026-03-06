import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { firebaseAuth } from "./firebase";

import type { User, Unsubscribe } from "firebase/auth";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function shouldFallbackToRedirect(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") {
    return false;
  }

  return (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

/**
 * Sign in with Google.
 * Always attempts popup first, then falls back to redirect if the popup
 * is blocked (common on mobile browsers / iPad Safari).
 */
export async function signInWithGoogle(): Promise<User | undefined> {
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    return result.user;
  } catch (error: unknown) {
    if (!shouldFallbackToRedirect(error)) {
      throw error;
    }

    await signInWithRedirect(firebaseAuth, googleProvider);
    return undefined;
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(firebaseAuth);
}

/**
 * Resolve a pending redirect sign-in result, if one exists.
 */
export async function getPendingRedirectUser(): Promise<User | null> {
  const result = await getRedirectResult(firebaseAuth);
  return result?.user ?? null;
}

/**
 * Subscribe to auth state changes.
 * Callback fires immediately with current state, then on every change.
 * Returns an unsubscribe function.
 */
export function onAuthStateChanged(
  callback: (user: User | null) => void,
): Unsubscribe {
  return firebaseOnAuthStateChanged(firebaseAuth, callback);
}

/**
 * Get the current user's ID token for API authentication.
 * Returns null if no user is signed in.
 * The token is automatically refreshed if expired.
 */
export async function getIdToken(): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

/**
 * Get the currently signed-in user, or null.
 */
export function getCurrentUser(): User | null {
  return firebaseAuth.currentUser;
}
