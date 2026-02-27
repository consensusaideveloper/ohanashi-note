import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

interface CreatorLifecycleBannerProps {
  status: string;
}

export function CreatorLifecycleBanner({
  status,
}: CreatorLifecycleBannerProps): ReactNode {
  if (status === "active") {
    return null;
  }

  let message = "";
  if (status === "death_reported") {
    message = UI_MESSAGES.creatorLifecycle.bannerDeathReported;
  } else if (status === "consent_gathering") {
    message = UI_MESSAGES.creatorLifecycle.bannerConsentGathering;
  } else if (status === "opened") {
    message = UI_MESSAGES.creatorLifecycle.bannerOpened;
  }

  if (message === "") {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-warning-light border-b border-warning px-4 py-3">
      <p className="text-lg text-warning font-medium text-center leading-snug">
        {message}
      </p>
    </div>
  );
}
