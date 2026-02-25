import { useCallback, useEffect, useState } from "react";

import { onAuthStateChanged, signInWithGoogle, signOut } from "../lib/auth";

import type { User } from "firebase/auth";

interface UseAuthReturn {
  /** The currently authenticated user, or null if not signed in. */
  user: User | null;
  /** True while the initial auth state is being determined. */
  loading: boolean;
  /** Sign in with Google. Returns the user on success. */
  handleSignIn: () => Promise<User | undefined>;
  /** Sign out the current user. */
  handleSignOut: () => Promise<void>;
  /** Error message from the last sign-in attempt, if any. */
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSignIn = useCallback(async (): Promise<User | undefined> => {
    setError(null);
    try {
      const signedInUser = await signInWithGoogle();
      return signedInUser;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "ログインに失敗しました";
      setError(message);
      return undefined;
    }
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await signOut();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "ログアウトに失敗しました";
      setError(message);
    }
  }, []);

  return { user, loading, handleSignIn, handleSignOut, error };
}
