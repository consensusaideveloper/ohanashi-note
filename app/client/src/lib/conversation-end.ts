/**
 * Normalize user-facing transcript text for lightweight intent matching.
 * Removes common punctuation and whitespace so phrase matching is robust
 * to ASR formatting differences.
 */
function normalizeTranscriptText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[。、，．,.!?！？「」『』（）()]/g, "");
}

const CONTINUE_CONVERSATION_PATTERNS = [
  /続けたい/,
  /続けて/,
  /まだ話したい/,
  /終わりたくない/,
  /終わらない/,
] as const;

const END_INTENT_PATTERNS = [
  /終了して/,
  /会話終了/,
  /終わりにしよう/,
  /終わりにします/,
  /終わりで/,
  /今日はここまで/,
  /今日はこのへんで/,
  /今日はこの辺で/,
  /もういいかな/,
  /もう大丈夫/,
  /おしまい/,
  /また今度/,
  /おやすみ/,
  /ありがとう.*(終わ|また)/,
  // Fatigue: covers 疲れた, 疲れちゃった, 疲れました, 疲れたわ
  /疲れ(た|ちゃった|ました|たわ)/,
  // "もう終わり" / "もう終わろう" / "もう終わります"
  /もう終わ(り|ろう|ります)/,
  // Standalone end-verb conjugations
  /終わろう/,
  /終わります/,
  // Farewell phrases
  /さようなら/,
  /バイバイ/,
  // "もういい" anchored to end to exclude "もういい加減"
  /もういい(です|よ|わ)?$/,
  // "もうこのくらいで" / "もうそのくらいで"
  /もう(この|その)くらいで/,
  // "そろそろ終わり" / "そろそろおしまい"
  /そろそろ(終わ|おしまい)/,
] as const;

const ONBOARDING_COMPLETION_PATTERNS = [
  /設定.*(完了|できました|終わりました|おわりました)/,
  /(準備|ご案内).*(完了|できました)/,
  /次の画面.*(進みましょう|進めます|お進みください)/,
  /(次の画面|このあと).*(いつでもお話しできます|お話しできます)/,
] as const;

/**
 * Detects whether the latest user utterance clearly signals
 * intent to end the current conversation.
 */
export function hasExplicitConversationEndIntent(text: string): boolean {
  const normalized = normalizeTranscriptText(text);
  if (normalized === "") {
    return false;
  }

  if (
    CONTINUE_CONVERSATION_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return false;
  }

  return END_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Detects onboarding-complete phrasing from assistant responses.
 * Used as a local safety fallback when the model forgets to call
 * end_conversation at the end of onboarding.
 */
export function hasOnboardingCompletionSignal(text: string): boolean {
  const normalized = normalizeTranscriptText(text);
  if (normalized === "") {
    return false;
  }
  return ONBOARDING_COMPLETION_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}
