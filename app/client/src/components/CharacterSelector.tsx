// Character selection screen displayed before category selection.
// Allows the user to choose which AI character to talk with.

import { CHARACTERS } from "../lib/characters";

import type { ReactNode } from "react";
import type { CharacterId } from "../types/conversation";

interface CharacterSelectorProps {
  onSelectCharacter: (characterId: CharacterId) => void;
}

// Accent border and active background styles per character
const CHARACTER_STYLES: Record<CharacterId, string> = {
  "character-a":
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-secondary-light/50 border-l-4 border-l-accent-secondary",
  "character-b":
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-tertiary-light/50 border-l-4 border-l-accent-tertiary",
  "character-c":
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-primary-light/50 border-l-4 border-l-accent-primary",
};

export function CharacterSelector({
  onSelectCharacter,
}: CharacterSelectorProps): ReactNode {
  return (
    <div className="min-h-dvh flex flex-col items-center bg-bg-primary px-4 py-8">
      {/* Header */}
      <div className="flex-none text-center mb-8 pt-4">
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-2">
          誰とお話ししますか？
        </h1>
        <p className="text-lg text-text-secondary">
          お好きな相手を選んでください
        </p>
      </div>

      {/* Character cards — single column for clarity */}
      <div className="w-full max-w-lg flex flex-col gap-3 md:gap-4">
        {CHARACTERS.map((character) => (
          <button
            key={character.id}
            type="button"
            className={`flex flex-col justify-center shadow-sm rounded-card p-5 md:p-6 min-h-[100px] md:min-h-[120px] transition-all duration-300 cursor-pointer ${CHARACTER_STYLES[character.id]}`}
            onClick={() => onSelectCharacter(character.id)}
          >
            <span className="text-xl md:text-2xl font-semibold text-text-primary mb-1">
              {character.name}
            </span>
            <span className="text-lg md:text-xl text-text-secondary leading-snug">
              {character.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
