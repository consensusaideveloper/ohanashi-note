import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import {
  getUserProfile,
  saveUserProfile,
  subscribeToUserProfileUpdates,
  clearAllData,
  deleteAccount,
} from "../lib/storage";
import { downloadDataExport } from "../lib/api";
import { CHARACTERS } from "../lib/characters";
import {
  FONT_SIZE_OPTIONS,
  SPEAKING_SPEED_OPTIONS,
  SILENCE_DURATION_OPTIONS,
  CONFIRMATION_LEVEL_OPTIONS,
  SETTINGS_MESSAGES,
  TERMS_CONSENT_MESSAGES,
  UI_MESSAGES,
} from "../lib/constants";
import {
  TERMS_OF_SERVICE_CONTENT,
  PRIVACY_POLICY_CONTENT,
} from "../lib/legal-content";
import { useFontSize } from "../contexts/FontSizeContext";
import { useAuthContext } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { ConfirmDialog } from "./ConfirmDialog";
import { PrintableEndingNote } from "./PrintableEndingNote";
import { LegalDocumentViewer } from "./LegalDocumentViewer";
import { Toast } from "./Toast";

import type {
  CharacterId,
  ConfirmationLevel,
  FontSizeLevel,
  SilenceDuration,
  SpeakingSpeed,
  UserProfile,
} from "../types/conversation";
import type { ReactNode } from "react";

interface SettingsScreenProps {
  lifecycleStatus: string;
}

function normalizeDisplayNameInput(value: string): string {
  return value.trim().replace(/[\s\u3000]+/g, " ");
}

function CharacterMiniAvatar({
  accentClass,
}: {
  accentClass: string;
}): ReactNode {
  const bgClass =
    accentClass === "accent-secondary"
      ? "from-accent-secondary-light to-accent-secondary/70"
      : accentClass === "accent-tertiary"
        ? "from-accent-tertiary-light to-accent-tertiary/70"
        : "from-accent-primary-light to-accent-primary/70";

  return (
    <div
      className={`relative w-10 h-10 rounded-full bg-gradient-to-br ${bgClass} shrink-0`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <ellipse cx="38" cy="42" rx="6" ry="6.5" fill="white" />
        <ellipse cx="62" cy="42" rx="6" ry="6.5" fill="white" />
        <path
          d="M 35 65 Q 50 71, 65 65"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function SettingsScreen({
  lifecycleStatus,
}: SettingsScreenProps): ReactNode {
  const { user, handleSignOut } = useAuthContext();
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();
  const [name, setName] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] =
    useState<CharacterId>("character-a");
  const [speakingSpeed, setSpeakingSpeed] = useState<SpeakingSpeed>("normal");
  const [silenceDuration, setSilenceDuration] =
    useState<SilenceDuration>("normal");
  const [confirmationLevel, setConfirmationLevel] =
    useState<ConfirmationLevel>("normal");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showPrintView, setShowPrintView] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Track saved values for dirty-state detection
  const [savedName, setSavedName] = useState("");
  const [savedAssistantName, setSavedAssistantName] = useState("");
  const [savedCharacterId, setSavedCharacterId] =
    useState<CharacterId>("character-a");
  const [savedSpeakingSpeed, setSavedSpeakingSpeed] =
    useState<SpeakingSpeed>("normal");
  const [savedSilenceDuration, setSavedSilenceDuration] =
    useState<SilenceDuration>("normal");
  const [savedConfirmationLevel, setSavedConfirmationLevel] =
    useState<ConfirmationLevel>("normal");

  const hasUnsavedChanges = useMemo(
    (): boolean =>
      name !== savedName ||
      assistantName !== savedAssistantName ||
      selectedCharacterId !== savedCharacterId ||
      speakingSpeed !== savedSpeakingSpeed ||
      silenceDuration !== savedSilenceDuration ||
      confirmationLevel !== savedConfirmationLevel,
    [
      name,
      savedName,
      assistantName,
      savedAssistantName,
      selectedCharacterId,
      savedCharacterId,
      speakingSpeed,
      savedSpeakingSpeed,
      silenceDuration,
      savedSilenceDuration,
      confirmationLevel,
      savedConfirmationLevel,
    ],
  );
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const selectedSpeakingSpeedDescription =
    SPEAKING_SPEED_OPTIONS.find((option) => option.value === speakingSpeed)
      ?.description ?? "";
  const selectedSilenceDurationDescription =
    SILENCE_DURATION_OPTIONS.find((option) => option.value === silenceDuration)
      ?.description ?? "";
  const selectedConfirmationLevelDescription =
    CONFIRMATION_LEVEL_OPTIONS.find(
      (option) => option.value === confirmationLevel,
    )?.description ?? "";

  // Dialog state
  const { fontSize, setFontSize } = useFontSize();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAccountDeleteFirst, setShowAccountDeleteFirst] = useState(false);
  const [showAccountDeleteSecond, setShowAccountDeleteSecond] = useState(false);
  const [showTermsViewer, setShowTermsViewer] = useState(false);
  const [showPrivacyViewer, setShowPrivacyViewer] = useState(false);

  const applyProfileUpdate = useCallback(
    (profile: Partial<UserProfile>, overwriteDraft: boolean): void => {
      if ("name" in profile && profile.name !== undefined) {
        setSavedName(profile.name);
        if (overwriteDraft) {
          setName(profile.name);
        }
      }

      if ("assistantName" in profile) {
        const normalizedAssistantName = profile.assistantName ?? "";
        setSavedAssistantName(normalizedAssistantName);
        if (overwriteDraft) {
          setAssistantName(normalizedAssistantName);
        }
      }

      if ("characterId" in profile) {
        const charId =
          profile.characterId !== undefined && profile.characterId !== null
            ? profile.characterId
            : ("character-a" as CharacterId);
        setSavedCharacterId(charId);
        if (overwriteDraft) {
          setSelectedCharacterId(charId);
        }
      }

      if ("speakingSpeed" in profile && profile.speakingSpeed !== undefined) {
        setSavedSpeakingSpeed(profile.speakingSpeed);
        if (overwriteDraft) {
          setSpeakingSpeed(profile.speakingSpeed);
        }
      }

      if (
        "silenceDuration" in profile &&
        profile.silenceDuration !== undefined
      ) {
        setSavedSilenceDuration(profile.silenceDuration);
        if (overwriteDraft) {
          setSilenceDuration(profile.silenceDuration);
        }
      }

      if (
        "confirmationLevel" in profile &&
        profile.confirmationLevel !== undefined
      ) {
        setSavedConfirmationLevel(profile.confirmationLevel);
        if (overwriteDraft) {
          setConfirmationLevel(profile.confirmationLevel);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile !== null) {
        applyProfileUpdate(
          {
            ...profile,
            speakingSpeed: profile.speakingSpeed ?? ("normal" as SpeakingSpeed),
            silenceDuration:
              profile.silenceDuration ?? ("normal" as SilenceDuration),
            confirmationLevel:
              profile.confirmationLevel ?? ("normal" as ConfirmationLevel),
          },
          true,
        );
      }
    });
  }, [applyProfileUpdate]);

  useEffect(() => {
    return subscribeToUserProfileUpdates((profile) => {
      applyProfileUpdate(profile, !hasUnsavedChangesRef.current);
    });
  }, [applyProfileUpdate]);

  const handleSaveSettings = useCallback((): void => {
    const normalizedAssistantName = normalizeDisplayNameInput(assistantName);
    void saveUserProfile({
      name,
      assistantName: normalizedAssistantName,
      characterId: selectedCharacterId,
      speakingSpeed,
      silenceDuration,
      confirmationLevel,
      updatedAt: Date.now(),
    })
      .then(() => {
        setSavedName(name);
        setSavedAssistantName(normalizedAssistantName);
        setAssistantName(normalizedAssistantName);
        setSavedCharacterId(selectedCharacterId);
        setSavedSpeakingSpeed(speakingSpeed);
        setSavedSilenceDuration(silenceDuration);
        setSavedConfirmationLevel(confirmationLevel);
        showToast(SETTINGS_MESSAGES.saved, "success");
      })
      .catch((error: unknown) => {
        console.error("Failed to save settings:", {
          error,
          name,
          assistantName: normalizedAssistantName,
          characterId: selectedCharacterId,
          speakingSpeed,
          silenceDuration,
          confirmationLevel,
        });
        showToast(UI_MESSAGES.error.saveFailed, "error");
      });
  }, [
    name,
    assistantName,
    selectedCharacterId,
    speakingSpeed,
    silenceDuration,
    confirmationLevel,
    showToast,
  ]);

  const handleViewTerms = useCallback((): void => {
    setShowTermsViewer(true);
  }, []);

  const handleCloseTerms = useCallback((): void => {
    setShowTermsViewer(false);
  }, []);

  const handleViewPrivacy = useCallback((): void => {
    setShowPrivacyViewer(true);
  }, []);

  const handleClosePrivacy = useCallback((): void => {
    setShowPrivacyViewer(false);
  }, []);

  const handleOpenPrint = useCallback((): void => {
    setShowPrintView(true);
  }, []);

  const handleClosePrint = useCallback((): void => {
    setShowPrintView(false);
  }, []);

  const handleExportData = useCallback((): void => {
    setIsExporting(true);
    void downloadDataExport()
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);
        const filename = `エンディングノート_${date}.zip`;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        showToast(SETTINGS_MESSAGES.dataExport.exportSuccess, "success");
      })
      .catch((error: unknown) => {
        console.error("Failed to export data:", { error });
        showToast(SETTINGS_MESSAGES.dataExport.exportFailed, "error");
      })
      .finally(() => {
        setIsExporting(false);
      });
  }, [showToast]);

  const handleClearAll = useCallback((): void => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback((): void => {
    setShowDeleteConfirm(false);
    void clearAllData()
      .then(() => {
        setDeleteMessage("すべての記録を消しました");
        setName("");
        setAssistantName("");
      })
      .catch((error: unknown) => {
        console.error("Failed to clear all data:", { error });
        showToast(UI_MESSAGES.error.deleteFailed, "error");
      });
  }, [showToast]);

  const handleDeleteCancel = useCallback((): void => {
    setShowDeleteConfirm(false);
  }, []);

  const handleLogout = useCallback((): void => {
    setShowLogoutConfirm(true);
  }, []);

  const handleLogoutConfirm = useCallback((): void => {
    setShowLogoutConfirm(false);
    void handleSignOut();
  }, [handleSignOut]);

  const handleLogoutCancel = useCallback((): void => {
    setShowLogoutConfirm(false);
  }, []);

  const handleAccountDelete = useCallback((): void => {
    setShowAccountDeleteFirst(true);
  }, []);

  const handleAccountDeleteFirstConfirm = useCallback((): void => {
    setShowAccountDeleteFirst(false);
    setShowAccountDeleteSecond(true);
  }, []);

  const handleAccountDeleteFirstCancel = useCallback((): void => {
    setShowAccountDeleteFirst(false);
  }, []);

  const handleAccountDeleteSecondConfirm = useCallback((): void => {
    setShowAccountDeleteSecond(false);
    void deleteAccount()
      .then(() => {
        void handleSignOut();
      })
      .catch((error: unknown) => {
        console.error("Failed to delete account:", { error });
        showToast(UI_MESSAGES.error.saveFailed, "error");
      });
  }, [handleSignOut, showToast]);

  const handleAccountDeleteSecondCancel = useCallback((): void => {
    setShowAccountDeleteSecond(false);
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setName(e.target.value);
    },
    [],
  );

  const handleAssistantNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setAssistantName(e.target.value);
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

  const handleFontSizeChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const level = e.currentTarget.dataset["fontSizeLevel"] as
        | FontSizeLevel
        | undefined;
      if (level !== undefined) {
        setFontSize(level);
      }
    },
    [setFontSize],
  );

  const handleSpeakingSpeedChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const value = e.currentTarget.dataset["speakingSpeed"] as
        | SpeakingSpeed
        | undefined;
      if (value !== undefined) {
        setSpeakingSpeed(value);
      }
    },
    [],
  );

  const handleSilenceDurationChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const value = e.currentTarget.dataset["silenceDuration"] as
        | SilenceDuration
        | undefined;
      if (value !== undefined) {
        setSilenceDuration(value);
      }
    },
    [],
  );

  const handleConfirmationLevelChange = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const value = e.currentTarget.dataset["confirmationLevel"] as
        | ConfirmationLevel
        | undefined;
      if (value !== undefined) {
        setConfirmationLevel(value);
      }
    },
    [],
  );

  return (
    <div className="flex-1 w-full overflow-y-auto px-4 py-4">
      <div className="max-w-lg mx-auto space-y-8">
        {/* Section 1: Font Size (safe, reversible) */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            文字の大きさ
          </h2>
          <p className="text-lg text-text-secondary">
            画面の文字を大きくできます
          </p>
          <div
            className="flex gap-2"
            role="radiogroup"
            aria-label="文字の大きさ"
          >
            {FONT_SIZE_OPTIONS.map((option) => {
              const isActive = fontSize === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  data-font-size-level={option.value}
                  className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
                    isActive
                      ? "bg-accent-primary text-text-on-accent shadow-sm"
                      : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                  }`}
                  onClick={handleFontSizeChange}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="bg-bg-surface rounded-card border border-border-light p-4">
            <p className="text-lg text-text-primary">
              この文章が見やすい大きさになるよう調整してください
            </p>
          </div>
        </section>

        {/* Section 2: Speaking Preferences */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            {SETTINGS_MESSAGES.speakingPreferences.title}
          </h2>
          <p className="text-lg text-text-secondary">
            {SETTINGS_MESSAGES.speakingPreferences.description}
          </p>

          {/* Speaking speed */}
          <p className="text-lg text-text-primary">
            {SETTINGS_MESSAGES.speakingPreferences.speedLabel}
          </p>
          <div
            className="flex gap-2"
            role="radiogroup"
            aria-label={SETTINGS_MESSAGES.speakingPreferences.speedLabel}
          >
            {SPEAKING_SPEED_OPTIONS.map((option) => {
              const isActive = speakingSpeed === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  data-speaking-speed={option.value}
                  className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
                    isActive
                      ? "bg-accent-primary text-text-on-accent shadow-sm"
                      : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                  }`}
                  onClick={handleSpeakingSpeedChange}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-base text-text-secondary px-1">
            {selectedSpeakingSpeedDescription}
          </p>

          {/* Silence duration */}
          <p className="text-lg text-text-primary mt-4">
            {SETTINGS_MESSAGES.speakingPreferences.silenceLabel}
          </p>
          <div
            className="flex gap-2"
            role="radiogroup"
            aria-label={SETTINGS_MESSAGES.speakingPreferences.silenceLabel}
          >
            {SILENCE_DURATION_OPTIONS.map((option) => {
              const isActive = silenceDuration === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  data-silence-duration={option.value}
                  className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
                    isActive
                      ? "bg-accent-primary text-text-on-accent shadow-sm"
                      : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                  }`}
                  onClick={handleSilenceDurationChange}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-base text-text-secondary px-1">
            {selectedSilenceDurationDescription}
          </p>

          {/* Confirmation level */}
          <p className="text-lg text-text-primary mt-4">
            {SETTINGS_MESSAGES.speakingPreferences.confirmationLabel}
          </p>
          <div
            className="flex gap-2"
            role="radiogroup"
            aria-label={SETTINGS_MESSAGES.speakingPreferences.confirmationLabel}
          >
            {CONFIRMATION_LEVEL_OPTIONS.map((option) => {
              const isActive = confirmationLevel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  data-confirmation-level={option.value}
                  className={`flex-1 min-h-11 rounded-full text-lg font-medium text-center py-2 transition-colors ${
                    isActive
                      ? "bg-accent-primary text-text-on-accent shadow-sm"
                      : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                  }`}
                  onClick={handleConfirmationLevelChange}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-base text-text-secondary px-1">
            {selectedConfirmationLevelDescription}
          </p>
        </section>

        {/* Section 3: Profile */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            お名前と話し相手
          </h2>
          <p className="text-lg text-text-secondary">
            {SETTINGS_MESSAGES.profile.description}
          </p>
          <label className="block text-lg text-text-primary" htmlFor="name">
            お名前
          </label>
          <input
            id="name"
            type="text"
            className="w-full rounded-card border border-border-light bg-bg-surface px-4 py-3 text-lg text-text-primary focus:outline-none focus:border-accent-primary"
            placeholder="例：太郎"
            value={name}
            onChange={handleNameChange}
          />
          <label
            className="block text-lg text-text-primary mt-4"
            htmlFor="assistantName"
          >
            話し相手の名前（呼び名）
          </label>
          <input
            id="assistantName"
            type="text"
            className="w-full rounded-card border border-border-light bg-bg-surface px-4 py-3 text-lg text-text-primary focus:outline-none focus:border-accent-primary"
            placeholder="例：さくら"
            value={assistantName}
            onChange={handleAssistantNameChange}
          />
          <p className="text-base text-text-secondary">
            会話の最初に話し相手が一度だけ名乗る名前です
          </p>
          <p className="text-lg text-text-primary mt-4">話し相手</p>
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
                <div className="flex items-center gap-3">
                  <CharacterMiniAvatar accentClass={char.accentColorClass} />
                  <div>
                    <p className="text-lg font-medium text-text-primary">
                      {char.name}
                    </p>
                    <p className="text-lg text-text-secondary">
                      {char.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Unified save button for speaking preferences + profile */}
        <section className="space-y-3">
          {hasUnsavedChanges && (
            <p
              className="text-lg text-warning font-medium"
              role="status"
              aria-live="polite"
            >
              {SETTINGS_MESSAGES.unsavedChanges}
            </p>
          )}
          <button
            type="button"
            disabled={!hasUnsavedChanges}
            className={`w-full rounded-full min-h-11 px-6 text-lg transition-colors ${
              hasUnsavedChanges
                ? "bg-accent-primary text-text-on-accent shadow-sm"
                : "bg-bg-surface text-text-secondary border border-border cursor-default"
            }`}
            onClick={handleSaveSettings}
          >
            保存する
          </button>
        </section>

        {/* Section 4: Account (low risk, reversible) */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            ログイン情報
          </h2>
          <p className="text-lg text-text-secondary">
            {SETTINGS_MESSAGES.account.description}
          </p>
          {user?.email !== undefined && user.email !== null && (
            <p className="text-lg text-text-primary">{user.email}</p>
          )}
          <button
            type="button"
            className="bg-bg-surface text-text-primary border border-border-light rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleLogout}
          >
            ログアウト
          </button>
        </section>

        {/* Section: Legal Documents */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            {TERMS_CONSENT_MESSAGES.settingsSectionTitle}
          </h2>
          <button
            type="button"
            className="w-full bg-bg-surface border border-border-light rounded-card px-4 py-3 text-left text-lg text-text-primary hover:bg-bg-surface-hover active:bg-bg-surface-hover transition-colors flex items-center justify-between min-h-11"
            onClick={handleViewTerms}
          >
            <span>{TERMS_CONSENT_MESSAGES.settingsViewTerms}</span>
            <svg
              className="h-5 w-5 text-text-secondary flex-none"
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
            className="w-full bg-bg-surface border border-border-light rounded-card px-4 py-3 text-left text-lg text-text-primary hover:bg-bg-surface-hover active:bg-bg-surface-hover transition-colors flex items-center justify-between min-h-11"
            onClick={handleViewPrivacy}
          >
            <span>{TERMS_CONSENT_MESSAGES.settingsViewPrivacy}</span>
            <svg
              className="h-5 w-5 text-text-secondary flex-none"
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
        </section>

        {/* Zone separator: safe settings above, data management below */}
        <div className="flex items-center gap-3 pt-4">
          <div className="flex-1 border-t border-border" />
          <p className="text-lg text-text-secondary whitespace-nowrap">
            記録の管理
          </p>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Section 5: Note Printing */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            {SETTINGS_MESSAGES.print.sectionTitle}
          </h2>
          <p className="text-lg text-text-secondary">
            {SETTINGS_MESSAGES.print.sectionDescription}
          </p>
          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleOpenPrint}
          >
            {SETTINGS_MESSAGES.print.buttonLabel}
          </button>
        </section>

        {/* Section 6: Data Export */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            {SETTINGS_MESSAGES.dataExport.sectionTitle}
          </h2>
          <p className="text-lg text-text-secondary">
            {SETTINGS_MESSAGES.dataExport.sectionDescription}
          </p>
          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg w-full flex items-center justify-center gap-2 disabled:opacity-50"
            onClick={handleExportData}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {SETTINGS_MESSAGES.dataExport.exporting}
              </>
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                {SETTINGS_MESSAGES.dataExport.buttonLabel}
              </>
            )}
          </button>
        </section>

        {/* Section 7: Data Deletion (critical, irreversible — collapsed) */}
        <details className="group">
          <summary className="text-lg font-semibold text-text-secondary cursor-pointer list-none flex items-center gap-2 min-h-11">
            {/* Warning triangle icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-error flex-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            記録の削除
            {/* Chevron indicator */}
            <svg
              className="h-4 w-4 text-text-secondary flex-none ml-auto transition-transform details-chevron"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </summary>
          <div className="pt-3 space-y-3">
            {lifecycleStatus === "active" ? (
              <>
                <p className="text-lg text-text-secondary leading-relaxed">
                  {SETTINGS_MESSAGES.deletion.description}
                </p>
                <button
                  type="button"
                  className="bg-bg-surface text-error border border-error rounded-full min-h-11 px-6 text-lg w-full"
                  onClick={handleClearAll}
                >
                  すべての記録を消す
                </button>
                {deleteMessage !== "" && (
                  <p className="text-accent-primary">{deleteMessage}</p>
                )}
              </>
            ) : (
              <div className="bg-bg-surface rounded-card border border-border-light p-4">
                <p className="text-lg text-text-secondary leading-relaxed">
                  {SETTINGS_MESSAGES.deletion.blocked}
                </p>
              </div>
            )}
          </div>
        </details>

        {/* Section 7: Account Deletion (most critical — collapsed) */}
        <details className="group">
          <summary className="text-lg font-semibold text-text-secondary cursor-pointer list-none flex items-center gap-2 min-h-11">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-error flex-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            退会する
            <svg
              className="h-4 w-4 text-text-secondary flex-none ml-auto transition-transform details-chevron"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </summary>
          <div className="pt-3 space-y-3">
            {lifecycleStatus === "active" ? (
              <>
                <p className="text-lg text-text-secondary leading-relaxed">
                  {SETTINGS_MESSAGES.accountDeletion.description}
                </p>
                <button
                  type="button"
                  className="bg-bg-surface text-error border border-error rounded-full min-h-11 px-6 text-lg w-full"
                  onClick={handleAccountDelete}
                >
                  退会する
                </button>
              </>
            ) : (
              <div className="bg-bg-surface rounded-card border border-border-light p-4">
                <p className="text-lg text-text-secondary leading-relaxed">
                  {SETTINGS_MESSAGES.accountDeletion.blocked}
                </p>
              </div>
            )}
          </div>
        </details>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="記録の削除"
        message={SETTINGS_MESSAGES.deletion.confirm}
        confirmLabel="削除する"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="ログアウト"
        message={SETTINGS_MESSAGES.account.logoutConfirm}
        confirmLabel="ログアウトする"
        cancelLabel="あとにする"
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
      />
      <ConfirmDialog
        isOpen={showAccountDeleteFirst}
        title="退会の確認"
        message={SETTINGS_MESSAGES.accountDeletion.firstConfirm}
        confirmLabel="次へ"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleAccountDeleteFirstConfirm}
        onCancel={handleAccountDeleteFirstCancel}
      />
      <ConfirmDialog
        isOpen={showAccountDeleteSecond}
        title="最終確認"
        message={SETTINGS_MESSAGES.accountDeletion.secondConfirm}
        confirmLabel="退会する"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleAccountDeleteSecondConfirm}
        onCancel={handleAccountDeleteSecondCancel}
      />
      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
      {showPrintView && <PrintableEndingNote onClose={handleClosePrint} />}
      {showTermsViewer && (
        <LegalDocumentViewer
          title={TERMS_CONSENT_MESSAGES.termsTitle}
          content={TERMS_OF_SERVICE_CONTENT}
          onClose={handleCloseTerms}
        />
      )}
      {showPrivacyViewer && (
        <LegalDocumentViewer
          title={TERMS_CONSENT_MESSAGES.privacyTitle}
          content={PRIVACY_POLICY_CONTENT}
          onClose={handleClosePrivacy}
        />
      )}
    </div>
  );
}
