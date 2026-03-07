import { CHARACTERS } from "./characters";
import {
  FONT_SIZE_LABELS,
  SPEAKING_SPEED_LABELS,
  SILENCE_DURATION_LABELS,
  CONFIRMATION_LEVEL_LABELS,
} from "./constants";
import { QUESTION_CATEGORIES } from "./questions";

import type { AccessPreset, FamilyMember } from "./family-api";
import type { UserProfile } from "../types/conversation";

interface ScreenContextDefinition {
  title: string;
  summary: string;
  primaryActions: string[];
  caution?: string;
}

const SCREEN_CONTEXTS: Record<string, ScreenContextDefinition> = {
  conversation: {
    title: "会話",
    summary:
      "AI とお話しする画面です。今の思い出やこれからの備えを、声でゆっくり記録できます。",
    primaryActions: [
      "このまま会話を続ける",
      "ノートや履歴の画面へ移動する",
      "話し方や文字の設定を変える",
    ],
  },
  history: {
    title: "履歴",
    summary: "これまでのお話の履歴を確認する画面です。",
    primaryActions: [
      "前の会話を開く",
      "どんな話をしたか振り返る",
      "必要なら会話画面へ戻る",
    ],
  },
  detail: {
    title: "会話の詳細",
    summary: "選んだ会話の内容を詳しく見る画面です。",
    primaryActions: [
      "お話の内容を読み返す",
      "要点を確認する",
      "前の画面へ戻る",
    ],
  },
  note: {
    title: "ノート",
    summary:
      "記録された内容をカテゴリごとに確認する画面です。話した内容が整理されて見やすく表示されます。",
    primaryActions: [
      "カテゴリごとの記録を見る",
      "このテーマで新しく話す",
      "元になった会話を開く",
    ],
  },
  settings: {
    title: "設定",
    summary: "名前や文字の大きさ、話し相手などを整える画面です。",
    primaryActions: [
      "文字の大きさを変える",
      "話し相手や話し方を変える",
      "アカウントや印刷の設定を確認する",
    ],
  },
  "family-dashboard": {
    title: "家族",
    summary: "家族とのつながりや見守りに関する情報を見る画面です。",
    primaryActions: [
      "登録中の家族を確認する",
      "家族ごとの詳細を開く",
      "必要なら招待や管理を進める",
      "見守り機能を始める",
    ],
  },
  "family-creator-detail": {
    title: "家族の詳細",
    summary: "選んだ家族との関係やノート閲覧状況を確認する画面です。",
    primaryActions: ["ノートを見る", "やることを見る", "開封設定を確認する"],
  },
  "family-note": {
    title: "家族ノート",
    summary: "家族向けに共有されているノートを確認する画面です。",
    primaryActions: [
      "カテゴリごとのノートを見る",
      "元の会話を開く",
      "前の家族画面へ戻る",
    ],
  },
  "family-todos": {
    title: "家族のやること",
    summary: "家族に関するやること一覧を確認する画面です。",
    primaryActions: ["やることの一覧を見る", "詳細を開く", "前の画面へ戻る"],
  },
  "family-todo-detail": {
    title: "やることの詳細",
    summary: "選んだやることの内容を詳しく確認する画面です。",
    primaryActions: ["内容を読む", "元のやること一覧へ戻る"],
  },
  "family-conversation-detail": {
    title: "家族の会話詳細",
    summary: "共有された会話の内容を詳しく見る画面です。",
    primaryActions: ["会話の内容を読む", "前の家族ノートへ戻る"],
  },
  "family-access-management": {
    title: "開封設定",
    summary: "どの家族にどのカテゴリを見せるかを確認する画面です。",
    primaryActions: [
      "見せるカテゴリを確認する",
      "開封設定を変更する",
      "前の画面へ戻る",
    ],
    caution: "大切な情報の見せ方に関わるので、変更時は内容を確認してください。",
  },
};

function findCharacterName(characterId?: string | null): string {
  return (
    CHARACTERS.find((character) => character.id === characterId)?.name ??
    "のんびり"
  );
}

function getCategoryLabel(categoryId: string): string {
  return (
    QUESTION_CATEGORIES.find((category) => category.id === categoryId)?.label ??
    categoryId
  );
}

export function describeCurrentSettings(profile: UserProfile | null): string {
  const profileName = profile === null ? "" : profile.name.trim();
  const name = profileName ? `${profileName}さん` : "未設定";
  const assistantName =
    profile?.assistantName !== undefined &&
    profile.assistantName !== null &&
    profile.assistantName.trim() !== ""
      ? profile.assistantName
      : "未設定";
  const characterName = findCharacterName(profile?.characterId);
  const fontSize = FONT_SIZE_LABELS[profile?.fontSize ?? "standard"];
  const speakingSpeed =
    SPEAKING_SPEED_LABELS[profile?.speakingSpeed ?? "normal"];
  const silenceDuration =
    SILENCE_DURATION_LABELS[profile?.silenceDuration ?? "normal"];
  const confirmationLevel =
    CONFIRMATION_LEVEL_LABELS[profile?.confirmationLevel ?? "normal"];

  return `現在の設定をお伝えします。お名前は${name}です。話し相手は${characterName}、呼び名は${assistantName}です。文字の大きさは${fontSize}です。話す速さは${speakingSpeed}、待ち時間は${silenceDuration}、確認の頻度は${confirmationLevel}です。`;
}

export function describeFamilyStatus(
  members: FamilyMember[],
  presets: AccessPreset[],
): string {
  const activeMembers = members.filter((member) => member.isActive);
  if (activeMembers.length === 0) {
    return "現在、登録されているご家族はまだいません。必要なら家族画面から招待できます。";
  }

  const presetMap = new Map<string, string[]>();
  for (const member of activeMembers) {
    presetMap.set(member.id, []);
  }
  for (const preset of presets) {
    const categories = presetMap.get(preset.familyMemberId);
    if (categories !== undefined) {
      categories.push(getCategoryLabel(preset.categoryId));
    }
  }

  const memberSummaries = activeMembers.map((member) => {
    const categories = presetMap.get(member.id) ?? [];
    const categorySummary =
      categories.length > 0
        ? `見せる設定は${categories.join("、")}です`
        : "見せる設定はまだありません";
    return `${member.name}さんは${member.relationshipLabel}で、${categorySummary}`;
  });

  return `現在登録されているご家族は${activeMembers.length}人です。${memberSummaries.join("。")}。`;
}

export function describeCurrentScreenContext(screen: string): string {
  const context = SCREEN_CONTEXTS[screen];
  if (context === undefined) {
    return "現在の画面情報をうまく確認できませんでした。必要なら会話、ノート、履歴、設定、家族の画面へご案内できます。";
  }

  const primaryActions = context.primaryActions.join("、");
  const caution = context.caution !== undefined ? ` ${context.caution}` : "";
  return `今は${context.title}の画面です。${context.summary} 主にできることは、${primaryActions}です。${caution}`.trim();
}

export function describeRecommendedNextAction(
  screen: string,
  profile: UserProfile | null,
  members: FamilyMember[],
): string {
  const activeMembers = members.filter((member) => member.isActive);
  const hasUserName = profile?.name.trim() !== "";
  const hasAssistantName =
    profile?.assistantName !== undefined &&
    profile.assistantName !== null &&
    profile.assistantName.trim() !== "";

  switch (screen) {
    case "conversation":
      return "今は会話の画面なので、このまま話したいテーマを1つ決めてお話しするのが自然です。迷う場合は、思い出のこと、ご家族のこと、医療のことなどから1つ選ぶと進めやすいです。";
    case "note":
      return "今はノートの画面です。まず気になるカテゴリを1つ開いて記録を確かめるのがおすすめです。足りない内容があれば、そのテーマで新しくお話しできます。";
    case "history":
      return "今は履歴の画面です。最近のお話を1つ開いて振り返るか、もう一度話したいテーマがあれば会話画面へ戻るのがおすすめです。";
    case "settings": {
      if (!hasUserName) {
        return "今は設定の画面です。まずお名前を確認すると、会話中の呼びかけが自然になります。";
      }
      if (!hasAssistantName) {
        return "今は設定の画面です。次は話し相手の呼び名を決めると、会話が親しみやすくなります。";
      }
      return "今は設定の画面です。見やすさを優先するなら文字の大きさ、聞きやすさを優先するなら話す速さや待ち時間を整えるのがおすすめです。";
    }
    case "family-dashboard":
      if (activeMembers.length === 0) {
        return "今は家族の画面です。まだご家族が登録されていないので、必要なら最初に招待を作るのがおすすめです。";
      }
      return `今は家族の画面です。${activeMembers.length}人のご家族がいるので、まずは1人選んで詳細や開封設定を確認するのがおすすめです。見守り機能もこの画面から始められます。`;
    case "family-access-management":
      return "今は開封設定の画面です。まず、どのカテゴリを誰に見せるかを1つずつ確認するのがおすすめです。迷う場合は医療や緊急時に必要な情報から整えると安心です。";
    default:
      return "まずは今の画面でできることを1つ確認して、次に必要な操作を選ぶのがおすすめです。必要ならノート、履歴、設定、家族の画面へご案内できます。";
  }
}
