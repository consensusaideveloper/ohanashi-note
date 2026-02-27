import { Component, useState, useCallback, useEffect, useRef } from "react";

import { FontSizeProvider, useFontSize } from "./contexts/FontSizeContext";
import { AuthProvider, useAuthContext } from "./contexts/AuthContext";
import {
  VoiceActionProvider,
  useVoiceActionRef,
} from "./contexts/VoiceActionContext";
import { useConversation } from "./hooks/useConversation";
import { CHARACTERS, getCharacterById } from "./lib/characters";
import {
  UI_MESSAGES,
  VOICE_SCREEN_MAP,
  FONT_SIZE_LABELS,
} from "./lib/constants";
import { QUESTION_CATEGORIES } from "./lib/questions";
import { getUserProfile, saveUserProfile } from "./lib/storage";
import { createInvitation, getLifecycleState } from "./lib/family-api";
import { getInviteTokenFromUrl } from "./lib/inviteUrl";
import { getPendingInviteToken } from "./lib/pendingInvite";
import { InvitationAcceptScreen } from "./components/InvitationAcceptScreen";
import { LoginScreen } from "./components/LoginScreen";
import { ActiveConversationBanner } from "./components/ActiveConversationBanner";
import { CreatorLifecycleBanner } from "./components/CreatorLifecycleBanner";
import { ConversationScreen } from "./components/ConversationScreen";
import { ConversationBlockedScreen } from "./components/ConversationBlockedScreen";
import { ConversationHistory } from "./components/ConversationHistory";
import { ConversationDetail } from "./components/ConversationDetail";
import { EndingNoteView } from "./components/EndingNoteView";
import { SettingsScreen } from "./components/SettingsScreen";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { FamilyScreen } from "./components/FamilyScreen";
import { FamilyNoteView } from "./components/FamilyNoteView";
import { CreatorDetailView } from "./components/CreatorDetailView";

import type { ReactNode, ErrorInfo } from "react";
import type { QuestionCategory } from "./types/conversation";
import type { FamilyConnection } from "./lib/family-api";

type AppScreen =
  | "conversation"
  | "history"
  | "detail"
  | "note"
  | "settings"
  | "family-dashboard"
  | "family-creator-detail"
  | "family-note";

/** Pending voice action that requires UI confirmation before executing. */
interface VoiceConfirmAction {
  title: string;
  message: string;
  actionType: "start_conversation" | "create_invitation";
  actionData: Record<string, string>;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("App error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-error-light p-6">
          <p className="text-xl text-text-primary mb-6">
            うまくいきませんでした
          </p>
          <button
            className="min-h-14 min-w-48 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4"
            onClick={(): void => this.setState({ hasError: false })}
          >
            もう一度やり直す
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthGate(): ReactNode {
  const { user, loading } = useAuthContext();
  const [inviteToken, setInviteToken] = useState<string | null>(
    () => getInviteTokenFromUrl() ?? getPendingInviteToken(),
  );

  const handleInviteComplete = useCallback((): void => {
    window.history.replaceState(null, "", "/");
    setInviteToken(null);
  }, []);

  // Show loading spinner while auth state is being determined
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary">
        <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login screen when not authenticated
  if (user === null) {
    return <LoginScreen />;
  }

  // Show invitation acceptance screen when URL has /invite/{token}
  if (inviteToken !== null) {
    return (
      <InvitationAcceptScreen
        token={inviteToken}
        onComplete={handleInviteComplete}
      />
    );
  }

  return (
    <VoiceActionProvider>
      <AppContent />
    </VoiceActionProvider>
  );
}

function AppContent(): ReactNode {
  const conversation = useConversation();
  const { setFontSize } = useFontSize();

  const [screen, setScreen] = useState<AppScreen>("conversation");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  // Track which screen to return to when leaving the detail view
  const [detailReturnScreen, setDetailReturnScreen] = useState<
    "history" | "note"
  >("history");

  // Creator lifecycle status (for the logged-in user as a creator)
  const [myLifecycleStatus, setMyLifecycleStatus] = useState("active");

  // Fetch lifecycle status on mount
  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile?.id !== undefined) {
        void getLifecycleState(profile.id)
          .then((state) => {
            setMyLifecycleStatus(state.status);
          })
          .catch(() => {
            // No lifecycle record means active
            setMyLifecycleStatus("active");
          });
      }
    });
  }, []);

  // Family mode state
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(
    null,
  );
  const [selectedCreatorName, setSelectedCreatorName] = useState("");
  const [selectedConnection, setSelectedConnection] =
    useState<FamilyConnection | null>(null);

  const handleSelectConversation = useCallback((id: string): void => {
    setSelectedConversationId(id);
    setDetailReturnScreen("history");
    setScreen("detail");
  }, []);

  const handleViewConversationFromNote = useCallback((id: string): void => {
    setSelectedConversationId(id);
    setDetailReturnScreen("note");
    setScreen("detail");
  }, []);

  const handleBackFromDetail = useCallback((): void => {
    setSelectedConversationId(null);
    setScreen(detailReturnScreen);
  }, [detailReturnScreen]);

  // Summarization guard state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showNavWarning, setShowNavWarning] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState<AppScreen | null>(
    null,
  );

  const navigateWithGuard = useCallback(
    (target: AppScreen): void => {
      if (isSummarizing && screen === "conversation" && target !== screen) {
        setPendingNavTarget(target);
        setShowNavWarning(true);
      } else {
        setScreen(target);
      }
    },
    [isSummarizing, screen],
  );

  const handleConfirmNavigation = useCallback((): void => {
    if (pendingNavTarget !== null) {
      setScreen(pendingNavTarget);
    }
    setShowNavWarning(false);
    setPendingNavTarget(null);
  }, [pendingNavTarget]);

  // Pending category for focused mode (from EndingNote "このテーマで話す")
  const [pendingCategory, setPendingCategory] = useState<
    QuestionCategory | undefined
  >(undefined);

  // Voice action confirmation state (Tier 2)
  const [voiceConfirm, setVoiceConfirm] = useState<VoiceConfirmAction | null>(
    null,
  );

  const handleVoiceConfirm = useCallback((): void => {
    if (voiceConfirm === null) return;
    if (voiceConfirm.actionType === "start_conversation") {
      conversation.stop();
      const category = voiceConfirm.actionData["category"];
      if (category !== undefined) {
        setPendingCategory(category as QuestionCategory);
      }
      setScreen("conversation");
    } else {
      // actionType === "create_invitation"
      const relationship = voiceConfirm.actionData["relationship"] ?? "";
      const relationshipLabel =
        voiceConfirm.actionData["relationshipLabel"] ?? "";
      createInvitation({ relationship, relationshipLabel })
        .then(() => {
          setScreen("family-dashboard");
        })
        .catch((error: unknown) => {
          console.error("Failed to create family invitation:", { error });
        });
    }
    setVoiceConfirm(null);
  }, [voiceConfirm, conversation]);

  const handleVoiceCancelConfirm = useCallback((): void => {
    setVoiceConfirm(null);
  }, []);

  const handleCancelNavigation = useCallback((): void => {
    setShowNavWarning(false);
    setPendingNavTarget(null);
  }, []);

  // Navigate from EndingNoteView to conversation screen for a specific category
  const handleStartFromNote = useCallback(
    (category: QuestionCategory): void => {
      setPendingCategory(category);
      setScreen("conversation");
    },
    [],
  );

  const handleCategoryConsumed = useCallback((): void => {
    setPendingCategory(undefined);
  }, []);

  const handleNavigateConversation = useCallback((): void => {
    navigateWithGuard("conversation");
  }, [navigateWithGuard]);

  const handleNavigateNote = useCallback((): void => {
    navigateWithGuard("note");
  }, [navigateWithGuard]);

  const handleNavigateHistory = useCallback((): void => {
    navigateWithGuard("history");
  }, [navigateWithGuard]);

  const handleNavigateSettings = useCallback((): void => {
    navigateWithGuard("settings");
  }, [navigateWithGuard]);

  const handleNavigateFamily = useCallback((): void => {
    navigateWithGuard("family-dashboard");
  }, [navigateWithGuard]);

  // Family mode navigation handlers
  const handleSelectCreatorDetail = useCallback(
    (
      creatorId: string,
      creatorName: string,
      connection: FamilyConnection,
    ): void => {
      setSelectedCreatorId(creatorId);
      setSelectedCreatorName(creatorName);
      setSelectedConnection(connection);
      setScreen("family-creator-detail");
    },
    [],
  );

  const handleBackFromCreatorDetail = useCallback((): void => {
    setSelectedConnection(null);
    setScreen("family-dashboard");
  }, []);

  const handleLeaveFamily = useCallback((): void => {
    setSelectedConnection(null);
    setScreen("family-dashboard");
  }, []);

  const handleViewNoteFromDetail = useCallback(
    (creatorId: string, creatorName: string): void => {
      setSelectedCreatorId(creatorId);
      setSelectedCreatorName(creatorName);
      setScreen("family-note");
    },
    [],
  );

  const handleBackFromFamilyNote = useCallback((): void => {
    // If we came from creator detail, go back to detail; otherwise go to dashboard
    if (selectedConnection !== null) {
      setScreen("family-creator-detail");
    } else {
      setSelectedCreatorId(null);
      setSelectedCreatorName("");
      setScreen("family-dashboard");
    }
  }, [selectedConnection]);

  // --- Voice action callbacks registration ---
  const voiceActionRef = useVoiceActionRef();
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // Use refs so callbacks always access the latest values without re-creating
  const navigateWithGuardRef = useRef(navigateWithGuard);
  navigateWithGuardRef.current = navigateWithGuard;
  const setFontSizeRef = useRef(setFontSize);
  setFontSizeRef.current = setFontSize;

  useEffect(() => {
    voiceActionRef.current = {
      // Tier 0: Navigation
      navigateToScreen: (target: string) => {
        const entry = VOICE_SCREEN_MAP[target];
        if (entry === undefined) {
          return { success: false, message: "その画面は見つかりません" };
        }
        navigateWithGuardRef.current(entry.screen as AppScreen);
        return {
          success: true,
          message: `${entry.label}の画面に移動しました`,
        };
      },
      viewNoteCategory: (category: string) => {
        const categoryInfo = QUESTION_CATEGORIES.find((c) => c.id === category);
        navigateWithGuardRef.current("note");
        return {
          success: true,
          message: categoryInfo
            ? `ノートの画面に移動しました。${categoryInfo.label}の記録をご覧ください`
            : "ノートの画面に移動しました",
        };
      },
      filterHistory: () => {
        navigateWithGuardRef.current("history");
        return {
          success: true,
          message: "会話の履歴画面に移動しました",
        };
      },
      // Tier 1: Settings
      changeFontSize: (level: string) => {
        const label = FONT_SIZE_LABELS[level];
        if (label === undefined) {
          return { success: false, message: "そのサイズは選べません" };
        }
        setFontSizeRef.current(level as "standard" | "large" | "x-large");
        return {
          success: true,
          message: `文字の大きさを${label}に変更しました`,
        };
      },
      changeCharacter: async (characterName: string) => {
        const character = CHARACTERS.find((c) => c.name === characterName);
        if (character === undefined) {
          return {
            success: false,
            message: "そのキャラクターは見つかりません",
          };
        }
        try {
          const profile = await getUserProfile();
          await saveUserProfile({
            name: profile?.name ?? "",
            characterId: character.id,
            updatedAt: Date.now(),
          });
          return {
            success: true,
            message: `次回の会話から${character.name}がお相手します`,
          };
        } catch {
          return {
            success: false,
            message: "キャラクターの変更に失敗しました",
          };
        }
      },
      updateUserName: async (name: string) => {
        const trimmed = name.trim();
        if (trimmed === "") {
          return { success: false, message: "名前を教えてください" };
        }
        try {
          const profile = await getUserProfile();
          await saveUserProfile({
            name: trimmed,
            characterId: profile?.characterId,
            updatedAt: Date.now(),
          });
          return {
            success: true,
            message: `お名前を${trimmed}に変更しました`,
          };
        } catch {
          return {
            success: false,
            message: "名前の変更に失敗しました",
          };
        }
      },
      // Tier 2: Confirmation-required
      requestStartConversation: (category: string) => {
        const categoryInfo = QUESTION_CATEGORIES.find((c) => c.id === category);
        if (categoryInfo === undefined) {
          return { success: false, message: "そのテーマは見つかりません" };
        }
        setVoiceConfirm({
          title: "テーマを変更",
          message: `「${categoryInfo.label}」のテーマで新しい会話を始めますか？\n現在の会話は保存されます。`,
          actionType: "start_conversation",
          actionData: { category },
        });
        return {
          success: true,
          message:
            "確認画面を表示しました。よろしければ画面の「はい」を押してください",
        };
      },
      requestCreateInvitation: (params: {
        relationship: string;
        relationshipLabel: string;
      }) => {
        setVoiceConfirm({
          title: "家族の招待",
          message: `${params.relationshipLabel}として家族を招待しますか？`,
          actionType: "create_invitation",
          actionData: {
            relationship: params.relationship,
            relationshipLabel: params.relationshipLabel,
          },
        });
        return {
          success: true,
          message:
            "確認画面を表示しました。よろしければ画面の「はい」を押してください",
        };
      },
      getCurrentScreen: () => screenRef.current,
    };
    return () => {
      voiceActionRef.current = null;
    };
  }, [voiceActionRef]);

  // Active conversation banner state
  const isConversationActive =
    conversation.state !== "idle" && conversation.state !== "error";
  const activeCharacterName =
    conversation.characterId !== null
      ? getCharacterById(conversation.characterId).name
      : null;

  const renderScreen = (): ReactNode => {
    switch (screen) {
      case "conversation":
        if (myLifecycleStatus !== "active") {
          return (
            <ConversationBlockedScreen
              lifecycleStatus={myLifecycleStatus}
              onNavigateToNote={handleNavigateNote}
            />
          );
        }
        return (
          <ConversationScreen
            initialCategory={pendingCategory}
            onCategoryConsumed={handleCategoryConsumed}
            onSummarizingChange={setIsSummarizing}
            conversation={conversation}
          />
        );
      case "history":
        return (
          <ConversationHistory
            onSelectConversation={handleSelectConversation}
          />
        );
      case "detail":
        if (selectedConversationId === null) {
          // Safety fallback: go back to history if no ID is selected
          setScreen("history");
          return null;
        }
        return (
          <ConversationDetail
            conversationId={selectedConversationId}
            onBack={handleBackFromDetail}
          />
        );
      case "note":
        return (
          <EndingNoteView
            onStartConversation={handleStartFromNote}
            onViewConversation={handleViewConversationFromNote}
          />
        );
      case "settings":
        return <SettingsScreen />;
      case "family-dashboard":
        return <FamilyScreen onSelectCreator={handleSelectCreatorDetail} />;
      case "family-creator-detail":
        if (selectedConnection === null) {
          setScreen("family-dashboard");
          return null;
        }
        return (
          <CreatorDetailView
            connection={selectedConnection}
            onBack={handleBackFromCreatorDetail}
            onViewNote={handleViewNoteFromDetail}
            onLeave={handleLeaveFamily}
          />
        );
      case "family-note":
        if (selectedCreatorId === null) {
          // Safety fallback: go back to family dashboard if no creator is selected
          setScreen("family-dashboard");
          return null;
        }
        return (
          <FamilyNoteView
            creatorId={selectedCreatorId}
            creatorName={selectedCreatorName}
            onBack={handleBackFromFamilyNote}
          />
        );
      default:
        return (
          <ConversationScreen
            initialCategory={pendingCategory}
            onCategoryConsumed={handleCategoryConsumed}
            onSummarizingChange={setIsSummarizing}
            conversation={conversation}
          />
        );
    }
  };

  const isTabHidden = screen === "detail" || screen === "family-creator-detail";
  const isFamilyScreen =
    screen === "family-dashboard" ||
    screen === "family-creator-detail" ||
    screen === "family-note";

  const showConversationBanner =
    isConversationActive &&
    screen !== "conversation" &&
    activeCharacterName !== null;

  const showLifecycleBanner = myLifecycleStatus !== "active";
  const hasTopBanner = showConversationBanner || showLifecycleBanner;

  return (
    <div className="min-h-dvh flex flex-col bg-bg-primary">
      {/* Lifecycle banner for creators with non-active status */}
      {showLifecycleBanner && (
        <CreatorLifecycleBanner status={myLifecycleStatus} />
      )}

      {/* Active conversation banner on non-conversation screens */}
      {showConversationBanner && !showLifecycleBanner && (
        <ActiveConversationBanner
          characterName={activeCharacterName}
          onReturn={handleNavigateConversation}
        />
      )}

      {/* Main content area */}
      <div
        className={`flex-1 flex flex-col pb-[72px] ${hasTopBanner ? "pt-12" : ""}`}
      >
        {renderScreen()}
      </div>

      {/* Navigation guard dialog during summarization */}
      <ConfirmDialog
        isOpen={showNavWarning}
        title={UI_MESSAGES.summarizing.dialogTitle}
        message={UI_MESSAGES.summarizing.navigationWarning}
        confirmLabel={UI_MESSAGES.summarizing.leaveButton}
        cancelLabel={UI_MESSAGES.summarizing.stayButton}
        onConfirm={handleConfirmNavigation}
        onCancel={handleCancelNavigation}
      />

      {/* Voice action confirmation dialog (Tier 2) */}
      <ConfirmDialog
        isOpen={voiceConfirm !== null}
        title={voiceConfirm?.title ?? ""}
        message={voiceConfirm?.message ?? ""}
        onConfirm={handleVoiceConfirm}
        onCancel={handleVoiceCancelConfirm}
      />

      {/* Tab bar - hidden when in detail view */}
      {!isTabHidden && (
        <nav className="fixed bottom-0 left-0 right-0 bg-bg-surface border-t border-border flex">
          <button
            type="button"
            className={`flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 transition-colors ${
              screen === "conversation"
                ? "text-accent-primary"
                : "text-text-secondary active:text-text-primary"
            } ${myLifecycleStatus !== "active" ? "opacity-50" : ""}`}
            onClick={handleNavigateConversation}
          >
            {/* Chat icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-lg leading-tight">会話する</span>
          </button>

          <button
            type="button"
            className={`flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 transition-colors ${
              screen === "note"
                ? "text-accent-primary"
                : "text-text-secondary active:text-text-primary"
            }`}
            onClick={handleNavigateNote}
          >
            {/* Book open icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            <span className="text-lg leading-tight">ノート</span>
          </button>

          <button
            type="button"
            className={`flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 transition-colors ${
              screen === "history"
                ? "text-accent-primary"
                : "text-text-secondary active:text-text-primary"
            }`}
            onClick={handleNavigateHistory}
          >
            {/* Document/list icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-lg leading-tight">履歴</span>
          </button>

          <button
            type="button"
            className={`flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 transition-colors ${
              isFamilyScreen
                ? "text-accent-primary"
                : "text-text-secondary active:text-text-primary"
            }`}
            onClick={handleNavigateFamily}
          >
            {/* Users/people icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
              />
            </svg>
            <span className="text-lg leading-tight">家族</span>
          </button>

          <button
            type="button"
            className={`flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 transition-colors ${
              screen === "settings"
                ? "text-accent-primary"
                : "text-text-secondary active:text-text-primary"
            }`}
            onClick={handleNavigateSettings}
          >
            {/* Cog icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
            <span className="text-lg leading-tight">設定</span>
          </button>
        </nav>
      )}
    </div>
  );
}

export function App(): ReactNode {
  return (
    <FontSizeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ErrorBoundary>
    </FontSizeProvider>
  );
}
