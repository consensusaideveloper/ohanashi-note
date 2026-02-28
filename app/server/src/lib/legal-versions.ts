/** Current active version of the Terms of Service. */
export const CURRENT_TERMS_VERSION = "1.0.0";

/** Current active version of the Privacy Policy. */
export const CURRENT_PRIVACY_VERSION = "1.0.0";

/**
 * Check if re-consent is needed by comparing major.minor versions.
 * Patch-level changes (typo fixes) do not require re-consent.
 */
export function needsReconsent(
  userTermsVersion: string,
  userPrivacyVersion: string,
): boolean {
  const userTermsMajorMinor = userTermsVersion.split(".").slice(0, 2).join(".");
  const currentTermsMajorMinor = CURRENT_TERMS_VERSION.split(".")
    .slice(0, 2)
    .join(".");
  const userPrivacyMajorMinor = userPrivacyVersion
    .split(".")
    .slice(0, 2)
    .join(".");
  const currentPrivacyMajorMinor = CURRENT_PRIVACY_VERSION.split(".")
    .slice(0, 2)
    .join(".");

  return (
    userTermsMajorMinor !== currentTermsMajorMinor ||
    userPrivacyMajorMinor !== currentPrivacyMajorMinor
  );
}
