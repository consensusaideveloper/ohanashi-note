export type AiCapabilityType = "reference" | "navigation" | "mutation";
export type AiCapabilityRiskTier = 0 | 1 | 2 | 3;
export type AiCapabilityAvailability = "onboarding" | "conversation" | "family";

export interface AiCapabilityDefinition {
  id: string;
  type: AiCapabilityType;
  riskTier: AiCapabilityRiskTier;
  availableIn: readonly AiCapabilityAvailability[];
  toolName?: string;
  description: string;
  userExamples: readonly string[];
}

export const AI_CAPABILITIES: readonly AiCapabilityDefinition[] = [
  {
    id: "conversation-search",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "search_my_information",
    description: "過去の会話とノートを横断して必要な情報を探す",
    userExamples: [
      "前に保険の話をしたっけ？",
      "もう記録されている内容を探して",
    ],
  },
  {
    id: "conversation-search-legacy",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "search_past_conversations",
    description: "過去の会話から関連する内容を探す",
    userExamples: ["前に旅行の話をしたっけ？", "前のお金の話を探して"],
  },
  {
    id: "note-entries-read",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "get_note_entries",
    description: "記録済みのノート内容を確認する",
    userExamples: ["思い出に何を記録した？", "医療の記録を見たい"],
  },
  {
    id: "settings-read",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "get_current_settings",
    description: "現在の設定内容を確認する",
    userExamples: ["今の設定を教えて", "文字の大きさは今どうなってる？"],
  },
  {
    id: "screen-context-read",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "get_current_screen_context",
    description: "現在の画面で何ができるか案内する",
    userExamples: ["この画面で何ができるの？", "今どこを見てるの？"],
  },
  {
    id: "next-action-read",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "get_recommended_next_action",
    description: "今の状況で次に何をすればよいか案内する",
    userExamples: ["次は何をすればいい？", "どう進めればいい？"],
  },
  {
    id: "family-status-read",
    type: "reference",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "get_family_status",
    description: "登録中の家族と開封設定を確認する",
    userExamples: ["今の家族設定を教えて", "妻には何を見せる設定？"],
  },
  {
    id: "screen-navigation",
    type: "navigation",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "navigate_to_screen",
    description: "画面を切り替える",
    userExamples: ["設定を開いて", "家族画面を見せて"],
  },
  {
    id: "note-category-navigation",
    type: "navigation",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "view_note_category",
    description: "ノートのカテゴリ画面を開く",
    userExamples: ["思い出の記録を見せて", "医療のノートを開いて"],
  },
  {
    id: "history-navigation",
    type: "navigation",
    riskTier: 0,
    availableIn: ["conversation"],
    toolName: "filter_conversation_history",
    description: "履歴画面を開く",
    userExamples: ["前の会話を見せて", "履歴を開いて"],
  },
  {
    id: "font-size-update",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding", "conversation"],
    toolName: "change_font_size",
    description: "文字の大きさを変更する",
    userExamples: ["文字を大きくして", "元の大きさに戻して"],
  },
  {
    id: "character-update",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding", "conversation"],
    toolName: "change_character",
    description: "話し相手を変更する",
    userExamples: ["話し相手を変えて", "にこにこにして"],
  },
  {
    id: "user-name-update",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding", "conversation"],
    toolName: "update_user_name",
    description: "ユーザー名を変更する",
    userExamples: ["太郎と呼んで", "名前を変えて"],
  },
  {
    id: "assistant-name-update",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding", "conversation"],
    toolName: "update_assistant_name",
    description: "AI の呼び名を変更する",
    userExamples: ["あなたの名前をさくらにして"],
  },
  {
    id: "speaking-preferences-update",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding", "conversation"],
    toolName: "update_speaking_preferences",
    description: "話し方の設定を変更する",
    userExamples: ["もっとゆっくり話して", "確認を増やして"],
  },
  {
    id: "access-preset-update",
    type: "mutation",
    riskTier: 1,
    availableIn: ["conversation"],
    toolName: "update_access_preset",
    description: "家族への開封設定を変更する",
    userExamples: ["医療のことは妻に見せて", "お金の話は長男には見せないで"],
  },
  {
    id: "focused-conversation-start",
    type: "mutation",
    riskTier: 2,
    availableIn: ["conversation"],
    toolName: "start_focused_conversation",
    description: "テーマを指定して新しい会話を始める",
    userExamples: ["お金のことで話したい"],
  },
  {
    id: "family-invitation-create",
    type: "mutation",
    riskTier: 2,
    availableIn: ["conversation"],
    toolName: "create_family_invitation",
    description: "家族招待を作成する",
    userExamples: ["妻を招待して", "長男を招待したい"],
  },
  {
    id: "onboarding-complete",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding"],
    toolName: "complete_onboarding",
    description: "オンボーディング完了を確定する",
    userExamples: [],
  },
  {
    id: "conversation-end",
    type: "mutation",
    riskTier: 1,
    availableIn: ["onboarding", "conversation"],
    toolName: "end_conversation",
    description: "会話を終了する",
    userExamples: ["今日はここまで", "また今度ね"],
  },
] as const;

export const NORMAL_REALTIME_TOOL_NAMES = new Set(
  AI_CAPABILITIES.filter(
    (capability) =>
      capability.toolName !== undefined &&
      capability.availableIn.includes("conversation"),
  ).map((capability) => capability.toolName as string),
);

export const ONBOARDING_REALTIME_TOOL_NAMES = new Set(
  AI_CAPABILITIES.filter(
    (capability) =>
      capability.toolName !== undefined &&
      capability.availableIn.includes("onboarding"),
  ).map((capability) => capability.toolName as string),
);
