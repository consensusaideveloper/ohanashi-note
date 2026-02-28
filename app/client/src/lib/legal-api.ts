import { fetchWithAuth } from "./api";

/** Response shape from GET /api/terms-consent/status. */
export interface ConsentStatus {
  hasConsented: boolean;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
  needsReconsent?: boolean;
  previousTermsVersion?: string;
  previousPrivacyVersion?: string;
  consentedAt?: string;
}

/** Check whether the current user has consented to the latest terms. */
export async function checkTermsConsentStatus(): Promise<ConsentStatus> {
  const response = await fetchWithAuth("/api/terms-consent/status");
  return response.json() as Promise<ConsentStatus>;
}

/** Record the user's consent to the given terms and privacy policy versions. */
export async function submitTermsConsent(
  termsVersion: string,
  privacyVersion: string,
): Promise<void> {
  await fetchWithAuth("/api/terms-consent", {
    method: "POST",
    body: JSON.stringify({ termsVersion, privacyVersion }),
  });
}
