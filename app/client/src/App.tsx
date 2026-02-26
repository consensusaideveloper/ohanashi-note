import { Component, useState, useCallback } from "react";

import { FontSizeProvider } from "./contexts/FontSizeContext";
import { AuthProvider, useAuthContext } from "./contexts/AuthContext";
import { UI_MESSAGES } from "./lib/constants";
import { LoginScreen } from "./components/LoginScreen";
import { ConversationScreen } from "./components/ConversationScreen";
import { ConversationHistory } from "./components/ConversationHistory";
import { ConversationDetail } from "./components/ConversationDetail";
import { EndingNoteView } from "./components/EndingNoteView";
import { SettingsScreen } from "./components/SettingsScreen";
import { ConfirmDialog } from "./components/ConfirmDialog";

import type { ReactNode, ErrorInfo } from "react";
import type { QuestionCategory } from "./types/conversation";

type AppScreen = "conversation" | "history" | "detail" | "note" | "settings";

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

  return <AppContent />;
}

function AppContent(): ReactNode {
  const [screen, setScreen] = useState<AppScreen>("conversation");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  // Track which screen to return to when leaving the detail view
  const [detailReturnScreen, setDetailReturnScreen] = useState<
    "history" | "note"
  >("history");

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

  const handleCancelNavigation = useCallback((): void => {
    setShowNavWarning(false);
    setPendingNavTarget(null);
  }, []);

  // Pending category for focused mode (from EndingNote "このテーマで話す")
  const [pendingCategory, setPendingCategory] = useState<
    QuestionCategory | undefined
  >(undefined);

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

  const renderScreen = (): ReactNode => {
    switch (screen) {
      case "conversation":
        return (
          <ConversationScreen
            initialCategory={pendingCategory}
            onCategoryConsumed={handleCategoryConsumed}
            onSummarizingChange={setIsSummarizing}
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
      default:
        return (
          <ConversationScreen
            initialCategory={pendingCategory}
            onCategoryConsumed={handleCategoryConsumed}
            onSummarizingChange={setIsSummarizing}
          />
        );
    }
  };

  const isTabHidden = screen === "detail";

  return (
    <div className="min-h-dvh flex flex-col bg-bg-primary">
      {/* Main content area */}
      <div className="flex-1 flex flex-col pb-[72px]">{renderScreen()}</div>

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

      {/* Tab bar - hidden when in detail view */}
      {!isTabHidden && (
        <nav className="fixed bottom-0 left-0 right-0 bg-bg-surface border-t border-border flex">
          <button
            type="button"
            className={`flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 transition-colors ${
              screen === "conversation"
                ? "text-accent-primary"
                : "text-text-secondary active:text-text-primary"
            }`}
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
