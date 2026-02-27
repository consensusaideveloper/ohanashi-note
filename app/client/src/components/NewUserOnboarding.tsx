import { useState, useCallback } from "react";

import { CHARACTERS } from "../lib/characters";
import { ONBOARDING_MESSAGES } from "../lib/constants";
import { saveUserProfile } from "../lib/storage";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { CharacterId } from "../types/conversation";
import type { ReactNode } from "react";

interface NewUserOnboardingProps {
  onComplete: () => void;
}

export function NewUserOnboarding({
  onComplete,
}: NewUserOnboardingProps): ReactNode {
  const [name, setName] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] =
    useState<CharacterId>("character-a");
  const [isSaving, setIsSaving] = useState(false);
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setName(e.target.value);
    },
    [],
  );

  const handleCharacterClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const id = e.currentTarget.dataset["characterId"] as
        | CharacterId
        | undefined;
      if (id !== undefined) {
        setSelectedCharacterId(id);
      }
    },
    [],
  );

  const handleStart = useCallback((): void => {
    setIsSaving(true);
    void saveUserProfile({
      name: name.trim(),
      characterId: selectedCharacterId,
      updatedAt: Date.now(),
    })
      .then(() => {
        onComplete();
      })
      .catch((error: unknown) => {
        console.error("Failed to save onboarding profile:", { error });
        showToast(ONBOARDING_MESSAGES.saveFailed, "error");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [name, selectedCharacterId, onComplete, showToast]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-lg space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary text-center">
          {ONBOARDING_MESSAGES.title}
        </h1>

        {/* Name input section */}
        <div className="space-y-2">
          <label
            className="block text-lg text-text-primary"
            htmlFor="onboarding-name"
          >
            {ONBOARDING_MESSAGES.nameLabel}
          </label>
          <p className="text-lg text-text-secondary">
            {ONBOARDING_MESSAGES.nameHelp}
          </p>
          <input
            id="onboarding-name"
            type="text"
            className="w-full rounded-card border border-border-light bg-bg-surface px-4 py-3 text-lg text-text-primary focus:outline-none focus:border-accent-primary"
            placeholder={ONBOARDING_MESSAGES.namePlaceholder}
            value={name}
            onChange={handleNameChange}
          />
        </div>

        {/* Character selection section */}
        <div className="space-y-2">
          <p className="text-lg text-text-primary">
            {ONBOARDING_MESSAGES.characterLabel}
          </p>
          <p className="text-lg text-text-secondary">
            {ONBOARDING_MESSAGES.characterHelp}
          </p>
          <div className="space-y-2">
            {CHARACTERS.map((char) => (
              <button
                key={char.id}
                type="button"
                data-character-id={char.id}
                className={`w-full rounded-card border px-4 py-3 text-left transition-colors ${
                  selectedCharacterId === char.id
                    ? "border-accent-primary bg-accent-primary-light"
                    : "border-border-light bg-bg-surface"
                }`}
                onClick={handleCharacterClick}
              >
                <p className="text-lg font-medium text-text-primary">
                  {char.name}
                </p>
                <p className="text-lg text-text-secondary">
                  {char.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          type="button"
          disabled={name.trim() === "" || isSaving}
          className="w-full min-h-14 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
          onClick={handleStart}
        >
          {isSaving
            ? ONBOARDING_MESSAGES.saving
            : ONBOARDING_MESSAGES.startButton}
        </button>
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
