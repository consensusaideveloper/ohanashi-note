import { ONBOARDING_DEFERRED_TOPIC_STORAGE_KEY } from "./constants";

interface DeferredTopicPayload {
  topic: string;
  savedAt: number;
  userId?: string;
}

const MIN_TOPIC_CHARS = 8;
const MAX_TOPIC_CHARS = 120;
const TOPIC_TTL_MS = 24 * 60 * 60 * 1000;

const ONBOARDING_SETTING_KEYWORDS = [
  "お名前",
  "呼び名",
  "話し相手",
  "キャラクター",
  "呼んで",
  "文字",
  "大きさ",
  "大きめ",
  "速さ",
  "ゆっくり",
  "待ち時間",
  "確認の頻度",
  "確認",
  "このまま",
  "そのまま",
  "おまかせ",
  "終わり",
  "終了",
] as const;

const NOTE_TOPIC_KEYWORDS = [
  "ノート",
  "終活",
  "エンディング",
  "思い出",
  "家族",
  "孫",
  "医療",
  "介護",
  "葬儀",
  "供養",
  "お墓",
  "お金",
  "資産",
  "相続",
  "遺言",
  "信託",
  "後見",
  "希望",
  "伝えたい",
] as const;

function normalizeTopicText(text: string): string {
  return text
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\s\u3000]+/g, " ")
    .slice(0, MAX_TOPIC_CHARS);
}

function normalizeUserId(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const normalized = userId.trim();
  return normalized === "" ? null : normalized;
}

function includesAnyKeyword(
  text: string,
  keywords: readonly string[],
): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function looksLikeDeferredTopic(text: string): boolean {
  if (text.length < MIN_TOPIC_CHARS) return false;
  if (includesAnyKeyword(text, ONBOARDING_SETTING_KEYWORDS)) return false;
  if (includesAnyKeyword(text, NOTE_TOPIC_KEYWORDS)) return true;

  // Fallback for free-form narratives that do not include explicit keywords.
  const hasNarrativeTone = /です|ます|たい|だった|けど|かな|。|！|？/.test(
    text,
  );
  return hasNarrativeTone && text.length >= 16;
}

function readDeferredTopicPayload(): DeferredTopicPayload | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_DEFERRED_TOPIC_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const payload = parsed as Partial<DeferredTopicPayload>;
    if (
      typeof payload.topic !== "string" ||
      typeof payload.savedAt !== "number"
    ) {
      return null;
    }
    const normalizedUserId = normalizeUserId(payload.userId);
    return {
      topic: normalizeTopicText(payload.topic),
      savedAt: payload.savedAt,
      ...(normalizedUserId !== null ? { userId: normalizedUserId } : {}),
    };
  } catch {
    return null;
  }
}

export function rememberOnboardingDeferredTopic(
  utterance: string,
  userId?: string | null,
): void {
  const topic = normalizeTopicText(utterance);
  if (!looksLikeDeferredTopic(topic)) {
    return;
  }
  const normalizedUserId = normalizeUserId(userId);
  const payload: DeferredTopicPayload = {
    topic,
    savedAt: Date.now(),
    ...(normalizedUserId !== null ? { userId: normalizedUserId } : {}),
  };

  try {
    localStorage.setItem(
      ONBOARDING_DEFERRED_TOPIC_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // localStorage unavailable — silent fallback
  }
}

export function getOnboardingDeferredTopic(
  userId?: string | null,
): string | null {
  const payload = readDeferredTopicPayload();
  if (payload === null) {
    return null;
  }

  const normalizedUserId = normalizeUserId(userId);
  if (
    normalizedUserId === null ||
    payload.userId === undefined ||
    payload.userId !== normalizedUserId
  ) {
    clearOnboardingDeferredTopic();
    return null;
  }

  const ageMs = Date.now() - payload.savedAt;
  if (ageMs < 0 || ageMs > TOPIC_TTL_MS || payload.topic.length === 0) {
    clearOnboardingDeferredTopic();
    return null;
  }

  return payload.topic;
}

export function clearOnboardingDeferredTopic(): void {
  try {
    localStorage.removeItem(ONBOARDING_DEFERRED_TOPIC_STORAGE_KEY);
  } catch {
    // Silent fallback
  }
}
