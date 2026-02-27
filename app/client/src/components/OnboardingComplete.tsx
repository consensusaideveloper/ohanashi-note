import { useState, useEffect } from "react";

import {
  ONBOARDING_COMPLETE_MESSAGES,
  FONT_SIZE_LABELS,
} from "../lib/constants";
import { getCharacterById } from "../lib/characters";
import { getUserProfile } from "../lib/storage";

import type { ReactNode } from "react";
import type { CharacterId } from "../types/conversation";

interface OnboardingCompleteProps {
  onStart: () => void;
}

const DEFAULT_CHARACTER_ID: CharacterId = "character-a";
const DEFAULT_FONT_SIZE_KEY = "standard";

export function OnboardingComplete({
  onStart,
}: OnboardingCompleteProps): ReactNode {
  const [userName, setUserName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [fontSizeLabel, setFontSizeLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getUserProfile()
      .then((profile) => {
        const name = profile?.name ?? "";
        const charId = profile?.characterId ?? DEFAULT_CHARACTER_ID;
        const fontSize = profile?.fontSize ?? DEFAULT_FONT_SIZE_KEY;

        setUserName(name);

        const character = getCharacterById(charId);
        setCharacterName(character.name);
        setCharacterDescription(character.description);

        const label =
          FONT_SIZE_LABELS[fontSize] ??
          FONT_SIZE_LABELS[DEFAULT_FONT_SIZE_KEY] ??
          "";
        setFontSizeLabel(label);
      })
      .catch((error: unknown) => {
        console.error("Failed to load profile for onboarding complete:", {
          error,
        });
        // Use defaults so the screen is still usable
        const character = getCharacterById(DEFAULT_CHARACTER_ID);
        setCharacterName(character.name);
        setCharacterDescription(character.description);
        setFontSizeLabel(FONT_SIZE_LABELS[DEFAULT_FONT_SIZE_KEY] ?? "");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary">
        <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-lg flex flex-col items-center">
        {/* Checkmark icon */}
        <div className="w-20 h-20 rounded-full bg-accent-secondary flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-text-on-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="mt-6 text-2xl md:text-3xl font-bold text-text-primary">
          {ONBOARDING_COMPLETE_MESSAGES.title}
        </h1>

        {/* Settings summary card */}
        <div
          className="mt-8 w-full rounded-card bg-bg-surface p-6 shadow-sm space-y-4"
          aria-live="polite"
        >
          {/* Name */}
          <div className="flex items-center gap-3">
            <span className="text-base text-text-secondary flex-shrink-0">
              {ONBOARDING_COMPLETE_MESSAGES.nameLabel}
            </span>
            <span className="text-lg text-text-primary font-medium">
              {userName !== "" ? `${userName}さん` : "―"}
            </span>
          </div>

          {/* Character */}
          <div className="flex items-center gap-3">
            <span className="text-base text-text-secondary flex-shrink-0">
              {ONBOARDING_COMPLETE_MESSAGES.characterLabel}
            </span>
            <div>
              <span className="text-lg text-text-primary font-medium">
                {characterName}
              </span>
              <span className="ml-2 text-base text-text-secondary">
                {characterDescription}
              </span>
            </div>
          </div>

          {/* Font size */}
          <div className="flex items-center gap-3">
            <span className="text-base text-text-secondary flex-shrink-0">
              {ONBOARDING_COMPLETE_MESSAGES.fontSizeLabel}
            </span>
            <span className="text-lg text-text-primary font-medium">
              {fontSizeLabel}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="mt-6 text-lg text-text-secondary text-center whitespace-pre-line">
          {ONBOARDING_COMPLETE_MESSAGES.description}
        </p>

        {/* CTA button */}
        <button
          type="button"
          className="mt-10 min-h-14 min-w-48 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
          onClick={onStart}
        >
          {ONBOARDING_COMPLETE_MESSAGES.startButton}
        </button>
      </div>
    </div>
  );
}
