import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";

import { getUserProfile, saveUserProfile } from "../lib/storage";
import { DEFAULT_FONT_SIZE_LEVEL } from "../lib/constants";

import type { ReactNode } from "react";
import type { FontSizeLevel } from "../types/conversation";

interface FontSizeContextValue {
  fontSize: FontSizeLevel;
  setFontSize: (level: FontSizeLevel) => void;
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSize: DEFAULT_FONT_SIZE_LEVEL,
  setFontSize: () => undefined,
});

interface FontSizeProviderProps {
  children: ReactNode;
}

export function FontSizeProvider({
  children,
}: FontSizeProviderProps): ReactNode {
  const [fontSize, setFontSizeState] = useState<FontSizeLevel>(
    DEFAULT_FONT_SIZE_LEVEL,
  );

  // Load saved font size from server on mount
  useEffect(() => {
    void getUserProfile().then((profile) => {
      const level =
        profile !== null && profile.fontSize !== undefined
          ? profile.fontSize
          : DEFAULT_FONT_SIZE_LEVEL;
      setFontSizeState(level);
      document.documentElement.dataset["fontSize"] = level;
    });
  }, []);

  // Apply data-font-size attribute to <html> whenever fontSize changes.
  // All levels (including "standard") apply overrides for elderly readability.
  useEffect(() => {
    document.documentElement.dataset["fontSize"] = fontSize;
  }, [fontSize]);

  const setFontSize = useCallback((level: FontSizeLevel): void => {
    setFontSizeState(level);
    // Persist only the changed field to avoid race-based overwrites.
    void saveUserProfile({
      fontSize: level,
      updatedAt: Date.now(),
    });
  }, []);

  return (
    <FontSizeContext value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext>
  );
}

export function useFontSize(): FontSizeContextValue {
  return useContext(FontSizeContext);
}
