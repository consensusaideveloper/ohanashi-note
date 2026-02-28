import { createContext, useContext, useRef } from "react";

import type { ReactNode, RefObject } from "react";
import type { VoiceActionResult } from "../types/conversation";

/** Callbacks that the voice AI can invoke to control the app. */
export interface VoiceActionCallbacks {
  // Tier 0: Read-only navigation (auto-execute, no confirmation)
  navigateToScreen: (screen: string) => VoiceActionResult;
  viewNoteCategory: (category: string) => VoiceActionResult;
  filterHistory: (params: {
    period?: string;
    category?: string;
  }) => VoiceActionResult;

  // Tier 1: Reversible settings (auto-execute, AI confirms verbally)
  changeFontSize: (level: string) => VoiceActionResult;
  changeCharacter: (characterId: string) => Promise<VoiceActionResult>;
  updateUserName: (name: string) => Promise<VoiceActionResult>;
  updateSpeakingPreferences: (params: {
    speakingSpeed?: string;
    silenceDuration?: string;
    confirmationLevel?: string;
  }) => Promise<VoiceActionResult>;

  // Tier 1: Access preset management
  updateAccessPreset: (params: {
    familyMemberName: string;
    category: string;
    action: "grant" | "revoke";
  }) => Promise<VoiceActionResult>;

  // Tier 2: Significant actions (UI confirmation dialog required)
  requestStartConversation: (category: string) => VoiceActionResult;
  requestCreateInvitation: (params: {
    relationship: string;
    relationshipLabel: string;
  }) => VoiceActionResult;

  // Current state info
  getCurrentScreen: () => string;
}

const defaultRef: RefObject<VoiceActionCallbacks | null> = {
  current: null,
};

const VoiceActionContext =
  createContext<RefObject<VoiceActionCallbacks | null>>(defaultRef);

interface VoiceActionProviderProps {
  children: ReactNode;
}

export function VoiceActionProvider({
  children,
}: VoiceActionProviderProps): ReactNode {
  const callbacksRef = useRef<VoiceActionCallbacks | null>(null);
  return (
    <VoiceActionContext value={callbacksRef}>{children}</VoiceActionContext>
  );
}

/** Get the mutable ref holding voice action callbacks. Used by useConversation. */
export function useVoiceActionRef(): RefObject<VoiceActionCallbacks | null> {
  return useContext(VoiceActionContext);
}
