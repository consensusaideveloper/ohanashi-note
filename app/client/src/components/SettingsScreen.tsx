import { useState, useEffect, useRef, useCallback } from "react";

import {
  getUserProfile,
  saveUserProfile,
  exportAllData,
  importAllData,
  clearAllData,
} from "../lib/storage";
import { CHARACTERS } from "../lib/characters";
import { SAVE_MESSAGE_TIMEOUT_MS, FONT_SIZE_OPTIONS } from "../lib/constants";
import { useFontSize } from "../contexts/FontSizeContext";
import { ConfirmDialog } from "./ConfirmDialog";

import type { CharacterId, FontSizeLevel } from "../types/conversation";
import type { ReactNode } from "react";

export function SettingsScreen(): ReactNode {
  const [name, setName] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] =
    useState<CharacterId>("character-a");
  const [saveMessage, setSaveMessage] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog state
  const { fontSize, setFontSize } = useFontSize();

  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile !== null) {
        setName(profile.name);
        if (profile.characterId !== undefined) {
          setSelectedCharacterId(profile.characterId);
        }
      }
    });
  }, []);

  const handleSaveProfile = useCallback((): void => {
    void saveUserProfile({
      name,
      characterId: selectedCharacterId,
      updatedAt: Date.now(),
    }).then(() => {
      setSaveMessage("保存しました");
      setTimeout(() => {
        setSaveMessage("");
      }, SAVE_MESSAGE_TIMEOUT_MS);
    });
  }, [name, selectedCharacterId]);

  const handleExport = useCallback((): void => {
    setExportStatus("書き出し中...");
    void exportAllData().then((json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const fileName = `ohanashi-ending-note-backup-${yyyy}${mm}${dd}.json`;
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportStatus("");
    });
  }, []);

  const handleImportClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file === undefined) {
        return;
      }
      setPendingImportFile(file);
      setShowImportConfirm(true);
    },
    [],
  );

  const handleImportConfirm = useCallback((): void => {
    setShowImportConfirm(false);
    if (pendingImportFile === null) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (): void => {
      const json = reader.result as string;
      importAllData(json)
        .then(() => {
          setImportError(false);
          setImportMessage("データを読み込みました");
        })
        .catch(() => {
          setImportError(true);
          setImportMessage("データの読み込みに失敗しました");
        })
        .finally(() => {
          if (fileInputRef.current !== null) {
            fileInputRef.current.value = "";
          }
          setPendingImportFile(null);
        });
    };
    reader.readAsText(pendingImportFile);
  }, [pendingImportFile]);

  const handleImportCancel = useCallback((): void => {
    setShowImportConfirm(false);
    setPendingImportFile(null);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClearAll = useCallback((): void => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback((): void => {
    setShowDeleteConfirm(false);
    void clearAllData().then(() => {
      setDeleteMessage("すべてのデータを削除しました");
      setName("");
    });
  }, []);

  const handleDeleteCancel = useCallback((): void => {
    setShowDeleteConfirm(false);
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

  return (
    <div className="flex-1 w-full overflow-y-auto px-4 py-4">
      <div className="max-w-lg mx-auto space-y-8">
        {/* Section: Font Size */}
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

        {/* Section 1: Profile */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            プロフィール
          </h2>
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
          {saveMessage !== "" && (
            <p className="text-accent-primary">{saveMessage}</p>
          )}
        </section>

        {/* Section 2: Data Backup */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            データのバックアップ
          </h2>
          <p className="text-lg text-text-secondary">
            大切なデータを守るため、定期的にバックアップをお取りください。
          </p>
          <button
            type="button"
            className="bg-accent-primary text-text-on-accent rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleExport}
            disabled={exportStatus !== ""}
          >
            {exportStatus !== "" ? exportStatus : "データを書き出す"}
          </button>
          <button
            type="button"
            className="bg-bg-surface text-text-primary border border-border-light rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleImportClick}
          >
            データを読み込む
          </button>
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          {importMessage !== "" && (
            <p className={importError ? "text-error" : "text-accent-primary"}>
              {importMessage}
            </p>
          )}
        </section>

        {/* Section 3: Data Deletion */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-secondary">
            データの削除
          </h2>
          <button
            type="button"
            className="bg-bg-surface text-error border border-error rounded-full min-h-11 px-6 text-lg w-full"
            onClick={handleClearAll}
          >
            すべてのデータを削除する
          </button>
          {deleteMessage !== "" && (
            <p className="text-accent-primary">{deleteMessage}</p>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={showImportConfirm}
        title="データの上書き"
        message="現在のデータはすべて上書きされます。よろしいですか？"
        confirmLabel="上書きする"
        cancelLabel="やめる"
        onConfirm={handleImportConfirm}
        onCancel={handleImportCancel}
      />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="データの削除"
        message="すべてのデータが完全に削除されます。この操作は取り消せません。よろしいですか？"
        confirmLabel="削除する"
        cancelLabel="やめる"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
