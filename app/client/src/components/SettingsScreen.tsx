import { useState, useEffect, useCallback } from "react";

import {
  getUserProfile,
  saveUserProfile,
  clearAllData,
  deleteAccount,
} from "../lib/storage";
import { CHARACTERS } from "../lib/characters";
import {
  FONT_SIZE_OPTIONS,
  SPEAKING_SPEED_OPTIONS,
  SILENCE_DURATION_OPTIONS,
  CONFIRMATION_LEVEL_OPTIONS,
  SETTINGS_MESSAGES,
  UI_MESSAGES,
} from "../lib/constants";
import { useFontSize } from "../contexts/FontSizeContext";
import { useAuthContext } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { ConfirmDialog } from "./ConfirmDialog";
import { PrintableEndingNote } from "./PrintableEndingNote";
import { Toast } from "./Toast";

import type {
  CharacterId,
  ConfirmationLevel,
  FontSizeLevel,
  SilenceDuration,
  SpeakingSpeed,
} from "../types/conversation";
import type { ReactNode } from "react";

interface SettingsScreenProps {
  lifecycleStatus: string;
}

export function SettingsScreen({
  lifecycleStatus,
}: SettingsScreenProps): ReactNode {
  const { user, handleSignOut } = useAuthContext();
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();
  const [name, setName] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] =
    useState<CharacterId>("character-a");
  const [speakingSpeed, setSpeakingSpeed] = useState<SpeakingSpeed>("normal");
  const [silenceDuration, setSilenceDuration] =
    useState<SilenceDuration>("normal");
  const [confirmationLevel, setConfirmationLevel] =
    useState<ConfirmationLevel>("normal");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showPrintView, setShowPrintView] = useState(false);

  // Dialog state
  const { fontSize, setFontSize } = useFontSize();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAccountDeleteFirst, setShowAccountDeleteFirst] = useState(false);
  const [showAccountDeleteSecond, setShowAccountDeleteSecond] = useState(false);

  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile !== null) {
        setName(profile.name);
        if (profile.characterId !== undefined && profile.characterId !== null) {
          setSelectedCharacterId(profile.characterId);
        }
        if (profile.speakingSpeed !== undefined) {
          setSpeakingSpeed(profile.speakingSpeed);
        }
        if (profile.silenceDuration !== undefined) {
          setSilenceDuration(profile.silenceDuration);
        }
        if (profile.confirmationLevel !== undefined) {
          setConfirmationLevel(profile.confirmationLevel);
        }
      }
    });
  }, []);

  const handleSaveProfile = useCallback((): void => {
    void saveUserProfile({
      name,
      characterId: selectedCharacterId,
      updatedAt: Date.now(),
    })
      .then(() => {
        showToast("保存しました", "success");
      })
      .catch((error: unknown) => {
        console.error("Failed to save profile:", {
          error,
          name,
          characterId: selectedCharacterId,
        });
        showToast(UI_MESSAGES.error.saveFailed, "error");
      });
  }, [name, selectedCharacterId, showToast]);

  const handleOpenPrint = useCallback((): void => {
    setShowPrintView(true);
  }, []);

  const handleClosePrint = useCallback((): void => {
    setShowPrintView(false);
  }, []);

  const handleClearAll = useCallback((): void => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback((): void => {
    setShowDeleteConfirm(false);
    void clearAllData()
      .then(() => {
        setDeleteMessage("すべての記録を消しました");
        setName("");
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

  const handleSaveSpeakingPreferences = useCallback((): void => {
    void saveUserProfile({
      name,
      characterId: selectedCharacterId,
      speakingSpeed,
      silenceDuration,
      confirmationLevel,
      updatedAt: Date.now(),
    })
      .then(() => {
        showToast(SETTINGS_MESSAGES.speakingPreferences.saved, "success");
      })
      .catch((error: unknown) => {
        console.error("Failed to save speaking preferences:", {
          error,
          speakingSpeed,
          silenceDuration,
          confirmationLevel,
        });
        showToast(UI_MESSAGES.error.saveFailed, "error");
      });
  }, [
    name,
    selectedCharacterId,
    speakingSpeed,
    silenceDuration,
    confirmationLevel,
    showToast,
  ]);

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

          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg"
            onClick={handleSaveSpeakingPreferences}
          >
            保存する
          </button>
        </section>

        {/* Section 3: Profile (save-gated) */}
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
                <p className="text-lg font-medium text-text-primary">
                  {char.name}
                </p>
                <p className="text-lg text-text-secondary">
                  {char.description}
                </p>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg"
            onClick={handleSaveProfile}
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

        {/* Section 6: Data Deletion (critical, irreversible — collapsed) */}
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
    </div>
  );
}
