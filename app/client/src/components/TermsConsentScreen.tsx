import { useState, useCallback } from "react";

import { TERMS_CONSENT_MESSAGES } from "../lib/constants";
import {
  TERMS_OF_SERVICE_CONTENT,
  PRIVACY_POLICY_CONTENT,
  CONSENT_SUMMARY_POINTS,
} from "../lib/legal-content";
import { submitTermsConsent } from "../lib/legal-api";
import { LegalDocumentViewer } from "./LegalDocumentViewer";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { ReactNode } from "react";

interface TermsConsentScreenProps {
  termsVersion: string;
  privacyVersion: string;
  isUpdate: boolean;
  onConsented: () => void;
}

export function TermsConsentScreen({
  termsVersion,
  privacyVersion,
  isUpdate,
  onConsented,
}: TermsConsentScreenProps): ReactNode {
  const [isAgreed, setIsAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const handleCheckboxChange = useCallback((): void => {
    setIsAgreed((prev) => !prev);
  }, []);

  const handleSubmit = useCallback((): void => {
    if (!isAgreed || isSubmitting) return;

    setIsSubmitting(true);
    submitTermsConsent(termsVersion, privacyVersion)
      .then(() => {
        onConsented();
      })
      .catch((error: unknown) => {
        console.error("Failed to submit terms consent:", { error });
        showToast(TERMS_CONSENT_MESSAGES.consentError, "error");
        setIsSubmitting(false);
      });
  }, [
    isAgreed,
    isSubmitting,
    termsVersion,
    privacyVersion,
    onConsented,
    showToast,
  ]);

  const handleShowTerms = useCallback((): void => {
    setShowTerms(true);
  }, []);

  const handleCloseTerms = useCallback((): void => {
    setShowTerms(false);
  }, []);

  const handleShowPrivacy = useCallback((): void => {
    setShowPrivacy(true);
  }, []);

  const handleClosePrivacy = useCallback((): void => {
    setShowPrivacy(false);
  }, []);

  if (showTerms) {
    return (
      <LegalDocumentViewer
        title={TERMS_CONSENT_MESSAGES.termsTitle}
        content={TERMS_OF_SERVICE_CONTENT}
        onClose={handleCloseTerms}
      />
    );
  }

  if (showPrivacy) {
    return (
      <LegalDocumentViewer
        title={TERMS_CONSENT_MESSAGES.privacyTitle}
        content={PRIVACY_POLICY_CONTENT}
        onClose={handleClosePrivacy}
      />
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-bg-primary">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Heading */}
          <h1 className="text-2xl font-bold text-text-primary text-center">
            {TERMS_CONSENT_MESSAGES.heading}
          </h1>

          {/* Update banner */}
          {isUpdate && (
            <div className="bg-accent-primary-light border border-accent-primary rounded-card p-4">
              <p className="text-lg font-semibold text-text-primary mb-1">
                {TERMS_CONSENT_MESSAGES.updateHeading}
              </p>
              <p className="text-lg text-text-secondary leading-relaxed">
                {TERMS_CONSENT_MESSAGES.updateDescription}
              </p>
            </div>
          )}

          {/* Summary card */}
          <div className="bg-bg-surface border border-border-light rounded-card p-5 space-y-3">
            <h2 className="text-xl font-semibold text-text-primary">
              {TERMS_CONSENT_MESSAGES.summaryTitle}
            </h2>
            <ul className="space-y-2">
              {CONSENT_SUMMARY_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 text-lg text-text-primary leading-relaxed"
                >
                  <span className="text-accent-primary mt-1 flex-none">●</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Document links */}
          <div className="space-y-3">
            <button
              type="button"
              className="w-full min-h-11 bg-bg-surface border border-border-light rounded-card px-4 py-3 text-left text-lg text-accent-primary hover:bg-bg-surface-hover active:bg-bg-surface-hover transition-colors flex items-center justify-between"
              onClick={handleShowTerms}
            >
              <span>{TERMS_CONSENT_MESSAGES.viewTermsButton}</span>
              <svg
                className="h-5 w-5 flex-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
            <button
              type="button"
              className="w-full min-h-11 bg-bg-surface border border-border-light rounded-card px-4 py-3 text-left text-lg text-accent-primary hover:bg-bg-surface-hover active:bg-bg-surface-hover transition-colors flex items-center justify-between"
              onClick={handleShowPrivacy}
            >
              <span>{TERMS_CONSENT_MESSAGES.viewPrivacyButton}</span>
              <svg
                className="h-5 w-5 flex-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer min-h-11">
            <input
              type="checkbox"
              checked={isAgreed}
              onChange={handleCheckboxChange}
              className="mt-1 w-6 h-6 rounded border-border-light text-accent-primary focus:ring-accent-primary flex-none"
            />
            <span className="text-lg text-text-primary leading-relaxed">
              {TERMS_CONSENT_MESSAGES.agreeCheckbox}
            </span>
          </label>
        </div>
      </div>

      {/* Submit button (sticky at bottom) */}
      <div className="sticky bottom-0 bg-bg-primary border-t border-border-light px-6 py-4">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            disabled={!isAgreed || isSubmitting}
            className={`w-full min-h-14 rounded-full text-xl font-medium transition-colors ${
              isAgreed && !isSubmitting
                ? "bg-accent-primary text-text-on-accent active:bg-accent-primary-hover"
                : "bg-bg-surface text-text-secondary border border-border-light cursor-not-allowed"
            }`}
            onClick={handleSubmit}
          >
            {isSubmitting
              ? TERMS_CONSENT_MESSAGES.submittingButton
              : TERMS_CONSENT_MESSAGES.submitButton}
          </button>
        </div>
      </div>

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </div>
  );
}
