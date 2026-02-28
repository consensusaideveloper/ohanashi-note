import type { ReactNode } from "react";

interface ActiveConversationBannerProps {
  characterName: string;
  onReturn: () => void;
}

/** Fixed banner shown on non-conversation screens when a voice session is active. */
export function ActiveConversationBanner({
  characterName,
  onReturn,
}: ActiveConversationBannerProps): ReactNode {
  return (
    <div className="flex-none">
      <button
        type="button"
        className="w-full min-h-11 bg-accent-primary text-text-on-accent flex items-center justify-center gap-2 px-4 py-3 shadow-md active:brightness-90 transition-all"
        onClick={onReturn}
        aria-label="会話画面に戻る"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-text-on-accent animate-pulse" />
        <span className="text-lg font-medium">
          {characterName}とお話し中です — タップで戻る
        </span>
      </button>
    </div>
  );
}
