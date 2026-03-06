import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { loadConfig } from "./config.js";

import type { App } from "firebase-admin/app";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";

const config = loadConfig();

const adminApp: App = initializeApp({
  credential: cert({
    projectId: config.firebaseAdmin.projectId,
    clientEmail: config.firebaseAdmin.clientEmail,
    privateKey: config.firebaseAdmin.privateKey,
  }),
});

const adminAuth: Auth = getAuth(adminApp);

/**
 * Verify a Firebase ID token and return the decoded token.
 * Throws if the token is invalid or expired.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  return adminAuth.verifyIdToken(idToken);
}

/**
 * Delete a Firebase Auth user by their UID.
 * Used for account deletion cascade.
 */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  await adminAuth.deleteUser(uid);
}

/**
 * Disable a Firebase Auth user by their UID.
 * Used for soft-delete: the user cannot sign in but the account is not deleted.
 */
export async function disableFirebaseUser(uid: string): Promise<void> {
  await adminAuth.updateUser(uid, { disabled: true });
}

/**
 * Re-enable a previously disabled Firebase Auth user.
 * Used for account reactivation after soft-delete.
 */
export async function enableFirebaseUser(uid: string): Promise<void> {
  await adminAuth.updateUser(uid, { disabled: false });
}
