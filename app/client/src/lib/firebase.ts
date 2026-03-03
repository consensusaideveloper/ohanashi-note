import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Messaging } from "firebase/messaging";

function getRequiredEnv(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: getRequiredEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getRequiredEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getRequiredEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as
    | string
    | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
  appId: getRequiredEnv("VITE_FIREBASE_APP_ID"),
};

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth: Auth = getAuth(firebaseApp);

let messagingInstance: Messaging | null = null;

/**
 * Lazily initialize Firebase Cloud Messaging.
 * Returns null if the browser does not support Service Workers or Push API.
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  if (messagingInstance !== null) return messagingInstance;
  const { getMessaging } = await import("firebase/messaging");
  messagingInstance = getMessaging(firebaseApp);
  return messagingInstance;
}
