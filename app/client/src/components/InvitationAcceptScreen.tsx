import { useState, useEffect, useCallback } from "react";

import { ApiError } from "../lib/api";
import { getInvitationInfo, acceptInvitation } from "../lib/family-api";
import {
  INVITATION_MESSAGES,
  INVITATION_SUCCESS_DELAY_MS,
} from "../lib/constants";

import type { ReactNode } from "react";
import type { InvitationInfo } from "../lib/family-api";

type InviteScreenPhase = "loading" | "info" | "accepting" | "success" | "error";

interface InvitationAcceptScreenProps {
  token: string;
  onComplete: () => void;
}

interface ParsedError {
  message: string;
  code: string;
}

export function parseApiError(err: unknown): ParsedError {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.responseBody) as Record<string, unknown>;
      const code = typeof body["code"] === "string" ? body["code"] : "";
      switch (code) {
        case "NOT_FOUND":
          return { message: INVITATION_MESSAGES.notFound, code };
        case "EXPIRED":
          return { message: INVITATION_MESSAGES.notFound, code };
        case "ALREADY_ACCEPTED":
          return { message: INVITATION_MESSAGES.alreadyUsed, code };
        case "SELF_INVITE":
          return { message: INVITATION_MESSAGES.selfInvite, code };
        case "ALREADY_MEMBER":
          return { message: INVITATION_MESSAGES.alreadyMember, code };
        default:
          return { message: INVITATION_MESSAGES.genericError, code };
      }
    } catch {
      return { message: INVITATION_MESSAGES.genericError, code: "" };
    }
  }
  return { message: INVITATION_MESSAGES.genericError, code: "" };
}

function formatExpiryDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isRetryableError(code: string): boolean {
  return (
    code === "" ||
    code === "GET_FAILED" ||
    code === "ACCEPT_FAILED" ||
    code === "CREATE_FAILED"
  );
}

export function InvitationAcceptScreen({
  token,
  onComplete,
}: InvitationAcceptScreenProps): ReactNode {
  const [phase, setPhase] = useState<InviteScreenPhase>("loading");
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const fetchInvitation = useCallback((): void => {
    setPhase("loading");
    setErrorMessage("");
    setErrorCode("");

    void getInvitationInfo(token)
      .then((info) => {
        setInvitation(info);
        setPhase("info");
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch invitation info:", {
          error: err,
          token,
        });
        const parsed = parseApiError(err);
        setErrorMessage(parsed.message);
        setErrorCode(parsed.code);
        setPhase("error");
      });
  }, [token]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  // Auto-navigate after success
  useEffect(() => {
    if (phase !== "success") return;
    const timer = setTimeout(onComplete, INVITATION_SUCCESS_DELAY_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [phase, onComplete]);

  const handleAccept = useCallback((): void => {
    setPhase("accepting");
    void acceptInvitation(token)
      .then(() => {
        setPhase("success");
      })
      .catch((err: unknown) => {
        console.error("Failed to accept invitation:", { error: err, token });
        const parsed = parseApiError(err);
        setErrorMessage(parsed.message);
        setErrorCode(parsed.code);
        setPhase("error");
      });
  }, [token]);

  const handleRetry = useCallback((): void => {
    fetchInvitation();
  }, [fetchInvitation]);

  const handleSkip = useCallback((): void => {
    onComplete();
  }, [onComplete]);

  const handleBackToApp = useCallback((): void => {
    onComplete();
  }, [onComplete]);

  const handleStartApp = useCallback((): void => {
    onComplete();
  }, [onComplete]);

  // --- Loading phase ---
  if (phase === "loading") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
        <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-6 text-lg text-text-secondary">
          {INVITATION_MESSAGES.loadingText}
        </p>
      </div>
    );
  }

  // --- Success phase ---
  if (phase === "success") {
    const creatorName = invitation?.creatorName ?? "";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl md:text-3xl font-bold text-text-primary">
          {INVITATION_MESSAGES.successTitle}
        </h1>
        <p
          className="mt-4 text-lg text-text-secondary text-center"
          aria-live="polite"
        >
          {creatorName}
          {INVITATION_MESSAGES.successMessage}
        </p>

        <button
          type="button"
          className="mt-10 min-h-14 min-w-48 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
          onClick={handleStartApp}
        >
          {INVITATION_MESSAGES.startAppButton}
        </button>
      </div>
    );
  }

  // --- Error phase ---
  if (phase === "error") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
        <div className="w-20 h-20 rounded-full bg-error-light flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-error"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <p
          className="mt-6 text-lg text-text-primary text-center leading-relaxed max-w-sm"
          role="alert"
        >
          {errorMessage}
        </p>

        <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
          {isRetryableError(errorCode) && (
            <button
              type="button"
              className="min-h-14 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
              onClick={handleRetry}
            >
              {INVITATION_MESSAGES.retryButton}
            </button>
          )}
          <button
            type="button"
            className="min-h-14 rounded-full border border-border-light bg-bg-surface text-text-primary text-xl px-8 py-4 transition-colors active:bg-bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
            onClick={handleBackToApp}
          >
            {INVITATION_MESSAGES.backToAppButton}
          </button>
        </div>
      </div>
    );
  }

  // --- Info / Accepting phase ---
  const isAccepting = phase === "accepting";
  const roleLabel =
    invitation?.role === "representative"
      ? INVITATION_MESSAGES.roleRepresentative
      : INVITATION_MESSAGES.roleMember;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
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
            d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
          />
        </svg>
      </div>

      <h1 className="mt-6 text-2xl md:text-3xl font-bold text-text-primary">
        {INVITATION_MESSAGES.screenTitle}
      </h1>

      {invitation !== null && (
        <div className="mt-6 w-full max-w-sm rounded-card bg-bg-surface p-6 shadow-sm space-y-3">
          <p className="text-xl text-text-primary font-semibold">
            {invitation.creatorName}
            {INVITATION_MESSAGES.fromUser}
          </p>
          <div className="space-y-2 text-lg text-text-secondary">
            <p>
              {INVITATION_MESSAGES.relationshipLabel}：
              {invitation.relationshipLabel}
            </p>
            <p>
              {INVITATION_MESSAGES.roleLabel}：{roleLabel}
            </p>
            <p>
              {INVITATION_MESSAGES.expiresLabel}：
              {formatExpiryDate(invitation.expiresAt)}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-4 w-full max-w-xs">
        <button
          type="button"
          className="w-full min-h-14 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
          disabled={isAccepting}
          onClick={handleAccept}
        >
          {isAccepting
            ? INVITATION_MESSAGES.acceptingButton
            : INVITATION_MESSAGES.acceptButton}
        </button>

        <button
          type="button"
          className="min-h-11 text-lg text-text-secondary underline underline-offset-4 transition-colors active:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
          onClick={handleSkip}
        >
          {INVITATION_MESSAGES.skipLink}
        </button>
      </div>
    </div>
  );
}
