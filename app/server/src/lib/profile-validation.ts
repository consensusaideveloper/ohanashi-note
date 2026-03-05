const VALID_CHARACTER_IDS = new Set([
  "character-a",
  "character-b",
  "character-c",
]);
const VALID_FONT_SIZES = new Set(["standard", "large", "x-large"]);
const VALID_SPEAKING_SPEEDS = new Set(["slow", "normal", "fast"]);
const VALID_SILENCE_DURATIONS = new Set(["short", "normal", "long"]);
const VALID_CONFIRMATION_LEVELS = new Set(["frequent", "normal", "minimal"]);

const DEFAULT_FONT_SIZE = "standard";
const DEFAULT_SPEAKING_SPEED = "normal";
const DEFAULT_SILENCE_DURATION = "normal";
const DEFAULT_CONFIRMATION_LEVEL = "normal";
const MAX_NAME_LENGTH = 80;
const MAX_ASSISTANT_NAME_LENGTH = 40;

export interface ProfileRecordLike {
  name: string;
  assistantName: string | null | undefined;
  characterId: string | null;
  fontSize: string;
  speakingSpeed: string;
  silenceDuration: string;
  confirmationLevel: string;
}

export interface NormalizedProfile {
  name: string;
  assistantName: string | null;
  characterId: string | null;
  fontSize: string;
  speakingSpeed: string;
  silenceDuration: string;
  confirmationLevel: string;
}

export interface ProfileValidationError {
  code: string;
  message: string;
}

export function normalizeStoredProfile(
  profile: ProfileRecordLike,
): NormalizedProfile {
  return {
    name: normalizeStoredName(profile.name),
    assistantName: normalizeStoredAssistantName(profile.assistantName),
    characterId: normalizeCharacterId(profile.characterId),
    fontSize: normalizeFontSize(profile.fontSize),
    speakingSpeed: normalizeSpeakingSpeed(profile.speakingSpeed),
    silenceDuration: normalizeSilenceDuration(profile.silenceDuration),
    confirmationLevel: normalizeConfirmationLevel(profile.confirmationLevel),
  };
}

export function validateProfileUpdateValue(
  field: string,
  value: unknown,
): { normalized: string | null } | { error: ProfileValidationError } {
  switch (field) {
    case "name":
      if (typeof value !== "string") {
        return {
          error: {
            code: "INVALID_NAME",
            message: "name は文字列で指定してください",
          },
        };
      }
      return validateName(value);
    case "assistantName":
      if (value === null) {
        return { normalized: null };
      }
      if (typeof value !== "string") {
        return {
          error: {
            code: "INVALID_ASSISTANT_NAME",
            message: "assistantName は文字列で指定してください",
          },
        };
      }
      return validateAssistantName(value);
    case "characterId":
      if (value === null) {
        return { normalized: null };
      }
      if (typeof value !== "string" || !VALID_CHARACTER_IDS.has(value)) {
        return {
          error: {
            code: "INVALID_CHARACTER",
            message: "characterId が不正です",
          },
        };
      }
      return { normalized: value };
    case "fontSize":
      if (typeof value !== "string" || !VALID_FONT_SIZES.has(value)) {
        return {
          error: {
            code: "INVALID_FONT_SIZE",
            message: "fontSize が不正です",
          },
        };
      }
      return { normalized: value };
    case "speakingSpeed":
      if (typeof value !== "string" || !VALID_SPEAKING_SPEEDS.has(value)) {
        return {
          error: {
            code: "INVALID_SPEAKING_SPEED",
            message: "speakingSpeed が不正です",
          },
        };
      }
      return { normalized: value };
    case "silenceDuration":
      if (typeof value !== "string" || !VALID_SILENCE_DURATIONS.has(value)) {
        return {
          error: {
            code: "INVALID_SILENCE_DURATION",
            message: "silenceDuration が不正です",
          },
        };
      }
      return { normalized: value };
    case "confirmationLevel":
      if (typeof value !== "string" || !VALID_CONFIRMATION_LEVELS.has(value)) {
        return {
          error: {
            code: "INVALID_CONFIRMATION_LEVEL",
            message: "confirmationLevel が不正です",
          },
        };
      }
      return { normalized: value };
    default:
      return {
        error: {
          code: "INVALID_PROFILE_FIELD",
          message: "更新できないプロフィール項目です",
        },
      };
  }
}

function validateName(
  value: string,
): { normalized: string } | { error: ProfileValidationError } {
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0) {
    return {
      error: {
        code: "INVALID_NAME",
        message: "name は空文字にできません",
      },
    };
  }
  if (normalized.length > MAX_NAME_LENGTH) {
    return {
      error: {
        code: "INVALID_NAME",
        message: `name は${String(MAX_NAME_LENGTH)}文字以内で指定してください`,
      },
    };
  }
  return { normalized };
}

function normalizeStoredName(value: string): string {
  return normalizeWhitespace(value).slice(0, MAX_NAME_LENGTH);
}

function validateAssistantName(
  value: string,
): { normalized: string | null } | { error: ProfileValidationError } {
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0) {
    return { normalized: null };
  }
  if (normalized.length > MAX_ASSISTANT_NAME_LENGTH) {
    return {
      error: {
        code: "INVALID_ASSISTANT_NAME",
        message: `assistantName は${String(MAX_ASSISTANT_NAME_LENGTH)}文字以内で指定してください`,
      },
    };
  }
  return { normalized };
}

function normalizeStoredAssistantName(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = normalizeWhitespace(value).slice(
    0,
    MAX_ASSISTANT_NAME_LENGTH,
  );
  return normalized === "" ? null : normalized;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/[\s\u3000]+/g, " ");
}

function normalizeCharacterId(value: string | null): string | null {
  if (value === null || !VALID_CHARACTER_IDS.has(value)) {
    return null;
  }
  return value;
}

function normalizeFontSize(value: string): string {
  return VALID_FONT_SIZES.has(value) ? value : DEFAULT_FONT_SIZE;
}

function normalizeSpeakingSpeed(value: string): string {
  return VALID_SPEAKING_SPEEDS.has(value) ? value : DEFAULT_SPEAKING_SPEED;
}

function normalizeSilenceDuration(value: string): string {
  return VALID_SILENCE_DURATIONS.has(value) ? value : DEFAULT_SILENCE_DURATION;
}

function normalizeConfirmationLevel(value: string): string {
  return VALID_CONFIRMATION_LEVELS.has(value)
    ? value
    : DEFAULT_CONFIRMATION_LEVEL;
}
