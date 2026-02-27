import { useState, useEffect } from "react";

import { useAuthContext } from "../contexts/AuthContext";
import { LOGIN_MESSAGES } from "../lib/constants";
import { getInvitationPreview } from "../lib/family-api";

import type { InvitationPreview } from "../lib/family-api";
import type { ReactNode } from "react";

interface LoginScreenProps {
  inviteToken?: string | null;
}

export function LoginScreen({ inviteToken }: LoginScreenProps): ReactNode {
  const { handleSignIn, error } = useAuthContext();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);

  const isInviteMode = inviteToken !== null && inviteToken !== undefined;

  useEffect(() => {
    if (inviteToken !== null && inviteToken !== undefined) {
      void getInvitationPreview(inviteToken).then(setPreview);
    }
  }, [inviteToken]);

  const handleClickSignIn = (): void => {
    setIsSigningIn(true);
    void handleSignIn().finally(() => {
      setIsSigningIn(false);
    });
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
      {/* App logo / title area */}
      <div className="flex flex-col items-center gap-4 mb-12">
        {/* Leaf icon representing "Midori" */}
        <div className="w-20 h-20 rounded-full bg-accent-secondary flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-text-on-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3c4.97 0 9 4.03 9 9-4.97 0-9-4.03-9-9ZM3 12c0 4.97 4.03 9 9 9 0-4.97-4.03-9-9-9Z"
            />
          </svg>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
          おはなし
        </h1>

        {isInviteMode ? (
          <>
            <p className="text-xl text-text-primary text-center leading-relaxed whitespace-pre-line font-medium">
              {preview?.valid === true &&
              preview.creatorName !== undefined &&
              preview.creatorName !== ""
                ? `${preview.creatorName}${LOGIN_MESSAGES.inviteFrom}`
                : LOGIN_MESSAGES.inviteGeneric}
            </p>
            <p className="text-lg text-text-secondary text-center leading-relaxed whitespace-pre-line">
              {LOGIN_MESSAGES.inviteDescription}
            </p>
            <p className="text-lg text-accent-primary text-center font-medium">
              {LOGIN_MESSAGES.inviteLoginPrompt}
            </p>
          </>
        ) : (
          <p className="text-lg text-text-secondary text-center leading-relaxed whitespace-pre-line">
            {LOGIN_MESSAGES.subtitle}
          </p>
        )}
      </div>

      {/* Sign in button */}
      <button
        type="button"
        onClick={handleClickSignIn}
        disabled={isSigningIn}
        className="min-h-14 min-w-64 rounded-full bg-bg-surface border-2 border-border text-text-primary text-xl px-8 py-4 flex items-center justify-center gap-3 transition-colors hover:bg-bg-surface-hover active:bg-bg-surface-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      >
        {/* Google icon */}
        <svg className="h-6 w-6" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {isSigningIn ? LOGIN_MESSAGES.signingIn : LOGIN_MESSAGES.signInButton}
      </button>

      {/* Error message */}
      {error !== null && (
        <p className="mt-6 text-lg text-error text-center" role="alert">
          {LOGIN_MESSAGES.error}
        </p>
      )}

      {/* Footer note */}
      <p className="mt-12 text-base text-text-secondary text-center">
        {LOGIN_MESSAGES.footer}
      </p>
    </div>
  );
}
