import {
  GoogleAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { firebaseAuth } from "./firebase";

import type { User, Unsubscribe } from "firebase/auth";

const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with Google using a popup window.
 * Returns the authenticated user.
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  return result.user;
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(firebaseAuth);
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
