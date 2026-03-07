import { ONBOARDING_REALTIME_TOOL_NAMES } from "./ai-capabilities";

import type {
  FontSizeLevel,
  SpeakingSpeed,
  SilenceDuration,
  ConfirmationLevel,
} from "../types/conversation";

/** Minimum character count for a user transcript to be considered valid input. */
export const MIN_TRANSCRIPT_LENGTH = 2;

// --- Noise transcript filter ---
/**
 * Transcript patterns commonly produced by noise/silence misrecognition (Whisper hallucinations).
 * These are filtered out even if they meet the minimum length requirement.
 */
export const NOISE_TRANSCRIPT_PATTERNS: readonly string[] = [
  "ご視聴ありがとうございました",
  "ご視聴ありがとうございます",
  "チャンネル登録お願いします",
  "チャンネル登録よろしくお願いします",
  "字幕は自動生成されています",
  "お疲れ様でした",
];

/**
 * Regex pattern to detect transcripts that consist entirely of punctuation,
 * whitespace, or common filler sounds. These are noise artifacts.
 */
export const NOISE_TRANSCRIPT_REGEX = /^[\s。、！？…・〜ー～]+$/;

// OpenAI Realtime API session config (voice is set dynamically per character)
export const SESSION_CONFIG = {
  turn_detection: {
    type: "server_vad" as const,
    threshold: 0.5, // OpenAI default; previous 0.7 was too high for mobile
    prefix_padding_ms: 300,
    silence_duration_ms: 800, // allow natural pauses for elderly speakers
    create_response: true, // explicitly trigger AI response after VAD stop
  },
} as const;

const REALTIME_TRANSCRIPTION_MODEL =
  (import.meta.env["VITE_REALTIME_TRANSCRIPTION_MODEL"] as
    | string
    | undefined) ?? "gpt-4o-transcribe";

/** Keep client-side session.update payloads aligned with server realtime config. */
export const SESSION_AUDIO_INPUT_CONFIG = {
  transcription: { model: REALTIME_TRANSCRIPTION_MODEL },
  noise_reduction: { type: "far_field" as const },
} as const;

// Function calling tools for the Realtime API session
export const REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "search_my_information",
    description:
      "過去の会話と記録済みノートをまとめて検索します。ユーザーが「前に話したことある？」「もう記録されてる？」と聞いた場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "探したいキーワード（例：「保険」「実家」「通院」）",
        },
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description:
            "検索対象のカテゴリ（省略可。省略すると全カテゴリを横断して探します）",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "search_past_conversations",
    description:
      "過去の会話から関連する内容を検索します。ユーザーが「前に話した〇〇」「以前の話」などと言及した場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "検索キーワード（例：「旅行」「家族」「お墓」）",
        },
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description:
            "検索対象のカテゴリ（省略可。省略すると全カテゴリを検索）",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "get_note_entries",
    description:
      "指定カテゴリのエンディングノートに記録済みの内容を取得します。ユーザーが「これまでに記録した内容を確認したい」「何を話したか見たい」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description: "取得するカテゴリ",
        },
      },
      required: ["category"],
    },
  },
  {
    type: "function" as const,
    name: "get_current_settings",
    description:
      "現在の設定内容を取得します。ユーザーが「今の設定を教えて」「文字の大きさは今どうなってる？」などと聞いた場合に使用してください。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function" as const,
    name: "get_current_screen_context",
    description:
      "現在表示中の画面で何ができるかを案内します。ユーザーが「この画面で何ができるの？」「今どこを見てるの？」と聞いた場合に使用してください。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function" as const,
    name: "get_recommended_next_action",
    description:
      "現在の画面や設定状況を踏まえて、次に何をするとよいか案内します。ユーザーが「次は何をすればいい？」「どう進めればいい？」と聞いた場合に使用してください。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function" as const,
    name: "get_family_status",
    description:
      "登録されている家族と現在の開封設定を取得します。ユーザーが「今の家族設定を教えて」「誰が登録されてる？」と聞いた場合に使用してください。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  // --- Tier 0: Navigation tools ---
  {
    type: "function" as const,
    name: "navigate_to_screen",
    description:
      "アプリの画面を切り替えます。ユーザーが「ノートを見せて」「設定を開いて」「履歴を見たい」などと言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          enum: ["conversation", "note", "history", "settings", "family"],
          description:
            "移動先の画面（conversation=会話、note=ノート、history=履歴、settings=設定、family=家族）",
        },
      },
      required: ["screen"],
    },
  },
  {
    type: "function" as const,
    name: "view_note_category",
    description:
      "エンディングノートの画面を開きます。ユーザーが「思い出の記録を見せて」「医療のノートを見たい」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description: "表示するカテゴリ",
        },
      },
      required: ["category"],
    },
  },
  {
    type: "function" as const,
    name: "filter_conversation_history",
    description:
      "会話の履歴画面を開きます。ユーザーが「前の会話を見せて」「履歴を確認したい」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description: "カテゴリで絞り込み（省略可）",
        },
      },
    },
  },
  // --- Tier 1: Settings tools ---
  {
    type: "function" as const,
    name: "change_font_size",
    description:
      "文字の大きさを変更します。ユーザーが「文字を大きくして」「もっと大きく」「元のサイズに戻して」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["standard", "large", "x-large"],
          description:
            "文字の大きさ（standard=標準、large=大きめ、x-large=特大）",
        },
      },
      required: ["level"],
    },
  },
  {
    type: "function" as const,
    name: "change_character",
    description:
      "話し相手のキャラクターを変更します（次回の会話から適用）。ユーザーが「話し相手を変えたい」「のんびりに変えて」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        character_name: {
          type: "string",
          enum: ["のんびり", "しっかり", "にこにこ"],
          description:
            "キャラクター名（のんびり=穏やかな話し相手、しっかり=頼れる相談相手、にこにこ=明るい話し相手）",
        },
      },
      required: ["character_name"],
    },
  },
  {
    type: "function" as const,
    name: "update_user_name",
    description:
      "ユーザーの表示名を変更します。ユーザーが「名前を変えたい」「〇〇と呼んで」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "新しい名前",
        },
      },
      required: ["name"],
    },
  },
  {
    type: "function" as const,
    name: "update_assistant_name",
    description:
      "話し相手（AI）の呼び名を変更します。ユーザーが「あなたの名前を〇〇にして」「〇〇さんと呼ばれてほしい」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "話し相手の新しい呼び名",
        },
      },
      required: ["name"],
    },
  },
  {
    type: "function" as const,
    name: "update_speaking_preferences",
    description:
      "話し相手の話し方の設定を変更します。ユーザーが「もっとゆっくり話して」「もう少し速く」「ちゃんと確認して」「待ち時間を長くして」などと言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        speaking_speed: {
          type: "string",
          enum: ["slow", "normal", "fast"],
          description:
            "話す速さ（slow=ゆっくり短い文で、normal=ふつう、fast=テキパキと）",
        },
        silence_duration: {
          type: "string",
          enum: ["short", "normal", "long"],
          description:
            "応答までの待ち時間（short=すぐ応答、normal=ふつう、long=ゆっくり待つ）",
        },
        confirmation_level: {
          type: "string",
          enum: ["frequent", "normal", "minimal"],
          description:
            "確認の頻度（frequent=こまめに確認、normal=ふつう、minimal=あまり確認しない）",
        },
      },
    },
  },
  // --- Tier 2: Confirmation-required tools ---
  {
    type: "function" as const,
    name: "start_focused_conversation",
    description:
      "指定テーマで新しい会話を始めます。現在の会話を終了して選択テーマの会話を開始します。ユーザーが「お金のことで話したい」「医療について相談したい」など特定テーマの会話を希望した場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description: "会話のテーマ",
        },
      },
      required: ["category"],
    },
  },
  {
    type: "function" as const,
    name: "create_family_invitation",
    description:
      "家族の招待リンクを作成します。ユーザーが「妻を招待して」「家族を追加したい」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        relationship: {
          type: "string",
          enum: ["spouse", "child", "sibling", "grandchild", "other"],
          description:
            "関係性（spouse=配偶者、child=子、sibling=兄弟姉妹、grandchild=孫、other=その他）",
        },
        relationship_label: {
          type: "string",
          description: "表示用の関係名（例：「妻」「長男」「義母」）",
        },
      },
      required: ["relationship", "relationship_label"],
    },
  },
  // --- Tier 1: Access preset tool ---
  {
    type: "function" as const,
    name: "update_access_preset",
    description:
      "エンディングノートの開封設定（どの家族にどのカテゴリを見せるか）を変更します。ユーザーが「医療のことは妻に見せて」「お金の話は太郎には見せないで」と言った場合に使用してください。",
    parameters: {
      type: "object",
      properties: {
        family_member_name: {
          type: "string",
          description:
            "対象の家族メンバーの名前または関係名（例：「太郎」「妻」）。プロンプトの家族リストから特定してください。",
        },
        category: {
          type: "string",
          enum: [
            "memories",
            "people",
            "house",
            "medical",
            "funeral",
            "money",
            "work",
            "digital",
            "legal",
            "trust",
            "support",
          ],
          description: "対象のカテゴリ",
        },
        action: {
          type: "string",
          enum: ["grant", "revoke"],
          description: "grant=見せる設定を追加、revoke=見せる設定を削除",
        },
      },
      required: ["family_member_name", "category", "action"],
    },
  },
  // --- Lifecycle tools ---
  {
    type: "function" as const,
    name: "complete_onboarding",
    description:
      "オンボーディング設定がすべて確認できたときにだけ呼び出します。最後の振り返りに入る直前に使用してください。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function" as const,
    name: "end_conversation",
    description:
      "会話を終了してデータを保存します。ユーザーが終わりたい意思を直接示した場合（「終わりにしよう」「また今度」「もういいかな」「さようなら」等）はすぐに呼び出してください。間接的なシグナル（「疲れちゃった」「ありがとうございました」「もうそろそろ」等）の場合は、まず「今日はここまでにしましょうか？」と確認し、同意を得てから呼び出してください。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
] as const;

/** Japanese labels for font size levels. */
export const FONT_SIZE_LABELS: Record<string, string> = {
  standard: "標準",
  large: "大きめ",
  "x-large": "特大",
};

// --- Speaking preference settings ---

/** Japanese labels for speaking speed levels. */
export const SPEAKING_SPEED_LABELS: Record<SpeakingSpeed, string> = {
  slow: "ゆっくり",
  normal: "ふつう",
  fast: "すこし速め",
};

/** Japanese labels for silence duration levels. */
export const SILENCE_DURATION_LABELS: Record<SilenceDuration, string> = {
  short: "短め",
  normal: "ふつう",
  long: "長め",
};

/** Japanese labels for confirmation level. */
export const CONFIRMATION_LEVEL_LABELS: Record<ConfirmationLevel, string> = {
  frequent: "こまめに確認",
  normal: "ふつう",
  minimal: "あまり確認しない",
};

/** Speaking speed options for settings UI. */
export const SPEAKING_SPEED_OPTIONS: readonly {
  readonly value: SpeakingSpeed;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "slow",
    label: "ゆっくり",
    description: "短い文で、一つずつゆっくり確認しながら",
  },
  {
    value: "normal",
    label: "ふつう",
    description: "聞き取りやすい自然な速さで",
  },
  { value: "fast", label: "すこし速め", description: "テンポよく、要点を短く" },
] as const;

/** Silence duration options for settings UI. */
export const SILENCE_DURATION_OPTIONS: readonly {
  readonly value: SilenceDuration;
  readonly label: string;
  readonly description: string;
}[] = [
  { value: "short", label: "短め", description: "間を短くして会話を進める" },
  { value: "normal", label: "ふつう", description: "自然な間で会話する" },
  { value: "long", label: "長め", description: "思い出す時間を長めにとる" },
] as const;

/** Confirmation level options for settings UI. */
export const CONFIRMATION_LEVEL_OPTIONS: readonly {
  readonly value: ConfirmationLevel;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "frequent",
    label: "こまめに確認",
    description: "要点を復唱して、安心しながら進める",
  },
  { value: "normal", label: "ふつう", description: "必要なところで確認する" },
  {
    value: "minimal",
    label: "あまり確認しない",
    description: "確認は少なめ（大事な点は復唱）",
  },
] as const;

/** Default speaking preference values. */
export const DEFAULT_SPEAKING_SPEED: SpeakingSpeed = "normal";
export const DEFAULT_SILENCE_DURATION: SilenceDuration = "normal";
export const DEFAULT_CONFIRMATION_LEVEL: ConfirmationLevel = "normal";

/** Map silence duration preference to VAD silence_duration_ms values.
 * Base value (normal) matches SESSION_CONFIG.turn_detection.silence_duration_ms. */
export const SILENCE_DURATION_MS_MAP: Record<SilenceDuration, number> = {
  short: 500,
  normal: 800,
  long: 1500,
};

/** Screen names the voice AI can navigate to, mapped to AppScreen values and Japanese labels. */
export const VOICE_SCREEN_MAP: Record<
  string,
  { screen: string; label: string }
> = {
  conversation: { screen: "conversation", label: "会話" },
  note: { screen: "note", label: "ノート" },
  history: { screen: "history", label: "履歴" },
  settings: { screen: "settings", label: "設定" },
  family: { screen: "family-dashboard", label: "家族" },
};

// User-facing messages (Japanese)
export const UI_MESSAGES = {
  idle: "お話ししましょう",
  connecting: "準備しています...",
  listening: "ゆっくりとお話しください",
  aiSpeaking: "お答えしています",
  error: {
    microphone: "マイクが使えません。「許可」ボタンを押してください。",
    network:
      "インターネットの接続が不安定です。しばらくしてからもう一度お試しください。",
    aiUnavailable:
      "ただいま混み合っています。少し時間をおいてからお試しください。",
    quotaExceeded:
      "会話回数の上限に達しました。明日または来月にお試しください。",
    unknown: "うまくいきませんでした。もう一度お試しください。",
    saveFailed: "保存できませんでした。もう一度お試しください。",
    printLoadFailed:
      "印刷用のデータを読み込めませんでした。もう一度お試しください。",
    deleteFailed: "削除できませんでした。もう一度お試しください。",
    summaryFailed:
      "お話のまとめを作れませんでした。会話の内容は保存されていますのでご安心ください。",
    noteLoadFailed: "ノートの内容を読み込めませんでした。",
    historyLoadFailed: "会話の記録を読み込めませんでした。",
    loadingText: "読み込み中...",
    loadFailed: "うまく読み込めませんでした。もう一度お試しください。",
  },
  family: {
    pageTitle: "家族",
    pageDescription: "ご家族の登録やノートの確認ができます",
    membersSectionTitle: "登録した家族",
    membersSectionDescription:
      "ご家族を登録しておくと、将来ノートを届けることができます。",
    connectionsSectionTitle: "家族のノート",
    noMembers:
      "まだ家族が登録されていません。\n下のボタンからご家族を招待できます。",
    noConnections:
      "まだ紐付いている家族がいません。\nご家族から招待を受けると、ここに表示されます。",
    inviteButton: "家族を招待する",
    inviteDialogTitle: "家族を招待",
    representativeLabel: "代表者",
    memberLabel: "家族",
    representativeHelp:
      "代表者とは、ノートを開封した後に情報の管理を任せる方です。",
    setRepresentative: "代表者に指定する",
    revokeRepresentative: "代表者を解除する",
    revokeRepresentativeConfirmTitle: "代表者の解除",
    revokeRepresentativeConfirmMessage:
      "この方の代表者の役割を解除してもよろしいですか？\n解除すると、一般の家族メンバーに戻ります。",
    representativeRevoked: "代表者を解除しました",
    editMember: "編集",
    editMemberDialogTitle: "家族情報の編集",
    memberUpdated: "家族情報を更新しました",
    saveButton: "保存する",
    removeConfirmTitle: "家族を削除",
    removeConfirmMessage: "この方を家族から削除してもよろしいですか？",
    inviteLinkCopied: "招待リンクをコピーしました",
    inviteCreated: "招待リンクを作成しました",
    memberRemoved: "家族を削除しました",
    representativeSet: "代表者に指定しました",
    noRepresentativeWarning: "代表者がまだ指定されていません",
    noRepresentativeHint:
      "代表者を指定しておくと、将来ノートの開封手続きをスムーズに行えます。ご家族のどなたかを代表者に指定することをおすすめします。",
    noRepresentativeFallbackNote:
      "代表者が指定されていないため、家族メンバーとしてこの操作を行えます。",
    noFamilyMembers: "まだ家族が登録されていません",
    inviteExpired: "この招待リンクは期限切れです",
    inviteAccepted: "家族として登録されました",
    maxRepresentativesReached: "代表者は最大3名まで指定できます",
    deathReportDialogTitle: "逝去のご報告",
    deathReportConfirmMessage:
      "この方の逝去を報告します。よろしいですか？\n（代表者が取り消すことができます）",
    deathReportSecondConfirmMessage:
      "この操作は家族全員に通知されます。本当に報告しますか？",
    cancelDeathReportConfirmMessage:
      "逝去のご報告を取り消しますか？「おげんきです」の状態に戻ります。",
    initiateConsentMessage:
      "ノートを開封するため、ご家族全員にお知らせを送ります。",
    consentDialogTitle: "ノート開封への同意",
    consentExplanation:
      "ご家族のノートを開封するためには、全員の同意が必要です。",
    consentAgreeButton: "同意する",
    consentDeclineButton: "同意しない",
    consentDetailExplanation:
      "同意するとノートが開封され、中身を見ることができるようになります。一度同意すると取り消すことはできませんのでご注意ください。",
    consentGiven: "同意しました",
    consentAutoResolved: "逝去のため自動同意",
    consentDeclined: "同意しませんでした",
    consentPending: "未回答",
    noteOpened: "ノートが開封されました",
    dashboardDescription: "紐付いている方のノートを確認できます",
    noteViewTitle: "ノートの閲覧",
    accessManagerTitle: "ノートの閲覧設定",
    accessManagerDescription:
      "ご家族ごとに、ノートのどの部分を見せるか設定します",
    participantAccessTitle: "家族の閲覧設定",
    participantAccessButton: "家族の閲覧設定",
    allCategoriesAccessible: "全カテゴリ閲覧可",
    accessSummary: "カテゴリ閲覧可",
    categoryGranted: "閲覧を許可しました",
    categoryRevoked: "閲覧を取り消しました",
    noAccessibleCategories: "閲覧可能なカテゴリがありません",
    noAccessibleCategoriesMemberHint:
      "代表者がノートの閲覧設定を管理しています。見られるカテゴリが増えるまでお待ちください。",
    noAccessibleCategoriesRepresentativeHint:
      "閲覧設定の画面から、見せるカテゴリを選ぶことができます。",
    noteNotOpened: "ノートはまだ開封されていません",
    backToCreatorList: "一覧に戻る",
    lifecycleActive: "おげんきです",
    lifecycleDeath: "ご報告済み",
    lifecycleConsent: "ご家族に確認中",
    lifecycleOpened: "ノートを開きました",
    accessPresetsSectionTitle: "開封時の設定",
    accessPresetsDescription:
      "ノートが開封されたとき、ご家族にどのカテゴリを見せたいか事前に設定できます。この設定は代表者への「推奨」として表示されます。",
    accessPresetsNoMembers: "家族メンバーを登録してから設定できます。",
    accessPresetsEmpty: "まだ設定がありません。",
    accessPresetAdded: "設定を追加しました",
    accessPresetRemoved: "設定を削除しました",
    accessPresetsNotActive:
      "この設定はノートが「活動中」の状態でのみ変更できます。",
    accessPresetsRecommendationHint:
      "この方はこのカテゴリを見せたいと設定していました",
    accessPresetsApplyAll: "推奨どおりに設定する",
    representativeFullAccess:
      "代表者はすべてのカテゴリに常にアクセスできます。",
    removeButton: "削除",
    editMemberDescription: "さんの情報を編集します",
    noNotifications: "通知はありません",
    markAllReadLabel: "すべて既読にする",
    notificationBellLabel: "お知らせ",
    notificationCloseLabel: "閉じる",
    notificationCriticalLabel: "● 要確認",
    notificationImportantLabel: "■ お知らせ",
    notificationWellnessLabel: "△ 見守り",
    myFamilyTab: "わたしの家族",
    familyNotesTab: "家族のノート",
    pendingActionsCount: "件の対応",
    creatorDetailTitle: "詳細",
    reportDeathButton: "逝去のご報告",
    initiateConsentButton: "ノートの開封をご家族に確認する",
    cancelDeathReportButton: "報告を取り消す",
    resetConsentButton: "確認をやり直す",
    viewNoteButton: "ノートを見る",
    accessManageButton: "閲覧設定",
    waitingForRepresentative: "代表者の対応をお待ちください",
    removeConfirmMessageRepresentative:
      "この方は代表者です。削除すると代表者の権限も解除されます。\n本当に削除してもよろしいですか？",
    removeConfirmMessageOpened:
      "この方を家族から削除してもよろしいですか？\n削除すると、この方のノートへのアクセス権も取り消されます。",
    removeConfirmMessageRepresentativeOpened:
      "この方は代表者です。削除すると代表者の権限とノートへのアクセス権が取り消されます。\n本当に削除してもよろしいですか？",
    removeDeletionBlocked: "現在の状態では家族メンバーを削除できません。",
    leaveButton: "この家族から脱退する",
    leaveConfirmTitle: "家族からの脱退",
    leaveConfirmMessage:
      "この方の家族から脱退してもよろしいですか？\n脱退後はノートの閲覧ができなくなります。",
    leaveConfirmMessageOpened:
      "この方の家族から脱退してもよろしいですか？\n脱退すると、ノートへのアクセス権が取り消されます。",
    leaveConfirmMessageDeathReported:
      "逝去報告後に脱退すると、ノートの開封手続きに参加できなくなります。\n本当に脱退してもよろしいですか？",
    leaveWarningFewMembers:
      "残りの家族メンバーが少なくなっています。脱退するとノートの管理が難しくなる場合があります。",
    memberLeft: "家族から脱退しました",
  },
  todo: {
    pageTitle: "やることリスト",
    noTodos: "まだやることが登録されていません",
    createButton: "やることを追加",
    generateButton: "自動で作成",
    generateConfirmTitle: "やることリストを自動作成",
    generateConfirmMessage:
      "ノートの内容をもとに、やるべきことを自動で作成します。作成されたやることは、そのカテゴリの閲覧権限がある家族メンバーに表示されます。表示設定は後から変更できます。",
    generating: "作成しています...",
    generatingStatusTitle: "AIがやることを作成中です",
    generatingStatusDescription:
      "作成には少し時間がかかることがあります。画面を移動しても作成は続きます。",
    generatingDialogTitle: "やること作成中です",
    generatingNavigationWarning:
      "AIがやることリストを作成中です。ここでお待ちいただくと、完了後に自動で反映されます。\n画面を移動しても作成は続きますのでご安心ください。",
    generatingStayButton: "ここで待つ",
    generatingLeaveButton: "移動する",
    generateEmpty: "すべてのノート項目から作成済みです",
    generateNoNew: "新しく追加できる項目はありませんでした",
    generatedWithSkipped: "重複する項目を除いて作成しました",
    statusPending: "まだ",
    statusInProgress: "やっている途中",
    statusCompleted: "完了",
    priorityHigh: "優先",
    priorityMedium: "普通",
    priorityLow: "あとで",
    assignButton: "担当を決める",
    volunteerButton: "自分がやる",
    unassigned: "担当者なし",
    commentPlaceholder: "メモを追加...",
    commentSubmit: "送信",
    sourceNote: "もとの記録",
    viewSourceNote: "ノートでもとの記録を確認する",
    dueDateLabel: "期限",
    progressLabel: "完了",
    deleteConfirmTitle: "やることを消す",
    deleteConfirmMessage: "このやることを消してもよろしいですか？",
    updated: "更新しました",
    created: "やることを追加しました",
    deleted: "消しました",
    commentAdded: "メモを追加しました",
    generated: "やることリストを作成しました",
    volunteered: "担当に名乗り出ました",
    statusChanged: "進み具合を変更しました",
    assigned: "担当者を設定しました",
    visibilityTitle: "表示設定",
    visibilityDescription:
      "メンバーごとにこのやることの表示/非表示を切り替えます",
    hidden: "非表示",
    visible: "表示",
    visibilitySummary: "人に表示中",
    visibilityAllHidden: "全員に非表示",
    visibilityUpdated: "表示設定を変更しました",
    titleLabel: "タイトル",
    descriptionLabel: "くわしい内容",
    categoryLabel: "カテゴリ",
    priorityLabel: "大事さ",
    assigneeLabel: "担当者",
    statusLabel: "進み具合",
    historyTitle: "履歴",
    commentsTitle: "メモ",
    showOlderComments: "前のメモを見る",
    showOlderHistory: "前の履歴を見る",
    detailTitle: "やることのくわしい内容",
    filterAll: "すべて",
    createDialogTitle: "やることを追加",
    noAssignee: "未定",
    noCategory: "指定なし",
    startButton: "着手する",
    completeButton: "完了にする",
    reopenButton: "まだに戻す",
    deletedUser: "退会した方",
    editButton: "編集",
    saveButton: "保存",
    cancelEditButton: "もどる",
    changeButton: "変更",
    noDueDate: "未設定",
    historyTitleChanged: "タイトルを変更",
    historyDescriptionChanged: "くわしい内容を変更",
    filterMyTasks: "自分の担当",
    myTaskBadge: "自分",
  },
  wheelPicker: {
    confirm: "決定",
    cancel: "もどる",
    relationshipTitle: "続柄を選択",
    assigneeTitle: "担当者を選択",
    categoryTitle: "カテゴリを選択",
    deliveryDayTitle: "配信日を選択",
  },
  datePicker: {
    title: "期限を選択",
    today: "今日",
    tomorrow: "明日",
    nextWeek: "1週間後",
    clear: "期限なし",
    confirm: "決定",
    cancel: "もどる",
    placeholder: "日付を選んでください",
    weekdays: ["日", "月", "火", "水", "木", "金", "土"] as readonly string[],
  },
  todoError: {
    loadFailed: "これからやることの読み込みがうまくいきませんでした",
    createFailed: "やることの追加がうまくいきませんでした",
    updateFailed: "やることの更新がうまくいきませんでした",
    deleteFailed: "やることを消せませんでした",
    commentFailed: "メモの追加がうまくいきませんでした",
    generateFailed: "自動作成がうまくいきませんでした",
    volunteerFailed: "担当の登録がうまくいきませんでした",
    detailLoadFailed: "やることの読み込みがうまくいきませんでした",
    visibilityFailed: "表示設定の変更がうまくいきませんでした",
  },
  creatorLifecycle: {
    bannerDeathReported:
      "ご家族から逝去の報告がありました。誤りの場合は代表者の方にご連絡ください。",
    bannerConsentGathering: "ノートの開封について、ご家族の同意が進行中です。",
    bannerOpened: "ノートが開封されました。ご家族が閲覧できる状態です。",
    conversationBlocked: "現在、新しい会話を始めることはできません。",
    conversationBlockedDeathReported:
      "逝去の報告がされているため、新しい会話を始めることはできません。\n誤りの場合は代表者の方にご連絡ください。",
    conversationBlockedOpened:
      "ノートが開封済みのため、新しい会話を始めることはできません。",
    viewNoteInstead: "ノートを見る",
  },
  familyError: {
    loadFailed: "家族情報の読み込みに失敗しました。",
    inviteFailed: "招待リンクの作成に失敗しました。",
    removeFailed: "家族の削除に失敗しました。",
    updateFailed: "家族情報の更新に失敗しました。",
    acceptFailed: "招待の受け入れに失敗しました。",
    reportDeathFailed: "逝去報告に失敗しました。",
    cancelDeathFailed: "逝去報告の取り消しに失敗しました。",
    consentFailed: "同意の送信に失敗しました。",
    consentStatusFailed: "同意状況の取得に失敗しました。",
    notificationsFailed: "通知の取得に失敗しました。",
    accessCategoriesFailed: "閲覧できるカテゴリの読み込みに失敗しました。",
    grantAccessFailed: "閲覧の許可に失敗しました。",
    revokeAccessFailed: "閲覧の取り消しに失敗しました。",
    noteFetchFailed: "ノートの取得に失敗しました。",
    accessPresetsFailed: "事前設定の取得に失敗しました。",
    accessPresetAddFailed: "設定の追加に失敗しました。",
    accessPresetRemoveFailed: "設定の削除に失敗しました。",
    accessPresetsRecommendationsFailed: "推奨設定の取得に失敗しました。",
    accessPresetVoiceUpdateFailed:
      "開封設定の変更に失敗しました。あとで画面から設定できます。",
    accessPresetVoiceMemberNotFound: "その名前の方が家族に見つかりません。",
    removeBlockedByLifecycle:
      "現在の状態では削除できません。しばらくしてからもう一度お試しください。",
    leaveFailed: "脱退に失敗しました。",
    leaveBlockedByLifecycle: "現在の状態では脱退できません。",
    leaveBlockedByDeletionConsent: "データ削除の同意収集中は脱退できません。",
    leaveBlockedLastMember:
      "最後の家族メンバーのため脱退できません。ノートの管理者がいなくなってしまいます。",
    leaveBlockedLastRepresentative:
      "最後の代表者のため脱退できません。他の方を代表者に指定してから脱退してください。",
  },
  audio: {
    downloadButton: "録音をダウンロード",
    downloading: "ダウンロードしています...",
    downloadFailed:
      "録音のダウンロードに失敗しました。もう一度お試しください。",
    play: "再生",
    pause: "一時停止",
    skipForward: "10秒進む",
    skipBackward: "10秒戻す",
    playbackSpeed: "再生速度",
    seekPosition: "再生位置",
    playerLabel: "音声プレーヤー",
  },
  sessionWarning: "まもなくお時間です。お話をまとめましょう。",
  sessionExpired: "お時間になりましたので、今日のお話はここまでにしましょう。",
  dailyLimitReached:
    "本日の会話回数の上限に達しました。また明日お話ししましょう。",
  summarizing: {
    dialogTitle: "まとめ作成中です",
    navigationWarning:
      "お話のまとめを作成中です。ここでお待ちいただくと、完了後に自動で表示されます。\n移動してもお話の内容は保存されていますのでご安心ください。",
    stayButton: "ここで待つ",
    leaveButton: "移動する",
    pendingBadge: "まとめ中...",
    failedBadge: "まとめ失敗",
  },
  buttons: {
    start: "お話しを始める",
    stop: "お話しを終える",
    retry: "もう一度やり直す",
    connecting: "接続しています...",
  },
} as const;

// --- Family limits ---
// Note: The server (family.ts) is the authoritative source for this value.
// This client-side constant must be kept in sync with the server.
/** Maximum number of representatives per creator. */
export const MAX_REPRESENTATIVES = 3;

// --- Session limits ---
// Note: The server (session-limits.ts) is the authoritative source for these values.
// These client-side constants must be kept in sync with the server.
/** Maximum session duration in milliseconds (20 minutes). */
export const MAX_SESSION_DURATION_MS = 20 * 60 * 1000;
/** Fraction of session time elapsed before showing the warning (85% = ~3 min left). */
export const SESSION_WARNING_THRESHOLD = 0.85;
/** Maximum number of conversation sessions per day. */
export const MAX_DAILY_SESSIONS = 3;

// --- Audio player ---
/** Skip duration in seconds for audio player forward/backward buttons. */
export const AUDIO_SKIP_SECONDS = 10;
/** Playback rate options for the audio player speed control. */
export const AUDIO_PLAYBACK_RATE_OPTIONS: readonly number[] = [0.75, 1, 1.25];
/** Default playback rate index (1x). */
export const AUDIO_DEFAULT_RATE_INDEX = 1;
/** Keyboard seek step in seconds for the progress bar arrow keys. */
export const AUDIO_KEYBOARD_SEEK_STEP = 5;

// --- UI timing ---
export const RETRY_DELAY_MS = 300;
export const TOAST_DISPLAY_DURATION_MS = 5000;

// --- Data limits ---
export const CROSS_CATEGORY_RECORDS_LIMIT = 5;
export const FOCUSED_SUMMARIES_LIMIT = 7;
export const GUIDED_RECENT_SUMMARIES_LIMIT = 10;

// --- Font size settings ---
export const DEFAULT_FONT_SIZE_LEVEL: FontSizeLevel = "standard";

export const FONT_SIZE_OPTIONS: readonly {
  readonly value: FontSizeLevel;
  readonly label: string;
}[] = [
  { value: "standard", label: "ふつう" },
  { value: "large", label: "大きめ" },
  { value: "x-large", label: "とても大きい" },
] as const;

// --- Login screen messages (Japanese) ---
export const LOGIN_MESSAGES = {
  subtitle: "会話をしながら\n大切な想いをノートにまとめましょう",
  signingIn: "準備しています...",
  signInButton: "Googleでログイン",
  error: "ログインできませんでした。もう一度お試しください。",
  footer: "Googleのアカウントを使って安全に始められます",
  inviteFrom: "さんから\nご家族の招待が届いています",
  inviteGeneric: "ご家族から招待が届いています",
  inviteDescription:
    "「おはなし」は会話をしながら\n大切な想いをノートにまとめるアプリです",
  inviteLoginPrompt: "はじめるにはログインしてください",
} as const;

export const ONBOARDING_MESSAGES = {
  title: "ようこそ！",
  nameLabel: "お名前",
  nameHelp: "会話のときにお呼びする名前です",
  namePlaceholder: "例：太郎",
  characterLabel: "話し相手",
  characterHelp: "あとからいつでも変更できます",
  startButton: "はじめる",
  saving: "準備しています...",
  saveFailed: "保存できませんでした。もう一度お試しください。",
} as const;

// --- Onboarding conversation ---
/** Tool names used during the onboarding conversation. */
export const ONBOARDING_TOOLS = REALTIME_TOOLS.filter((t) =>
  ONBOARDING_REALTIME_TOOL_NAMES.has(t.name),
);

export const ONBOARDING_CONVERSATION_MESSAGES = {
  title: "会話でご案内します",
  subtitle: "マイクを使って会話しながら設定を行います",
  startButton: "会話をはじめる",
  reconnectPrompt: "接続が切れました。もう一度お試しください。",
} as const;

export const ONBOARDING_COMPLETE_MESSAGES = {
  title: "準備ができました！",
  nameLabel: "お名前",
  characterLabel: "話し相手",
  assistantNameLabel: "話し相手の名前",
  fontSizeLabel: "文字の大きさ",
  speakingSpeedLabel: "話す速さ",
  silenceDurationLabel: "待ち時間",
  confirmationLevelLabel: "確認の頻度",
  description:
    "話し相手とお話しすると、大切な想いがノートにまとめられます。\nいつでも気軽にお話ししてくださいね。",
  startButton: "はじめる",
} as const;

/** localStorage key for deferred topic handoff from onboarding to first main conversation. */
export const ONBOARDING_DEFERRED_TOPIC_STORAGE_KEY =
  "onboarding_deferred_topic";

// --- Settings screen messages (Japanese) ---
export const SETTINGS_MESSAGES = {
  saved: "設定を保存しました",
  unsavedChanges: "変更がまだ保存されていません",
  profile: {
    description: "お名前・話し相手・呼び名を設定します。",
  },
  speakingPreferences: {
    title: "話し相手の話し方",
    description:
      "話す速さ・待ち時間・確認のしかたを、聞きやすい形に調整できます",
    speedLabel: "話す速さ",
    silenceLabel: "待ち時間",
    confirmationLabel: "確認の頻度",
  },
  account: {
    description: "現在お使いのログイン情報です",
    logoutConfirm:
      "ログアウトしてもよろしいですか？記録はそのまま残ります。同じ方法でまたログインできます。",
  },
  print: {
    title: "わたしのエンディングノート",
    subtitle: "大切な想いの記録",
    generatedAt: "作成日",
    printButton: "印刷する",
    closeButton: "戻る",
    noEntries: "まだ記録がありません。お話しして、ノートを作りましょう。",
    footer: "おはなしエンディングノートで作成",
    disclaimer: "この文書は記録として保管用です。法的効力はありません。",
    sectionTitle: "ノートの印刷",
    sectionDescription:
      "記録した内容をきれいな形式で印刷できます。「PDFに保存」もできます。",
    buttonLabel: "ノートを印刷する",
  },
  conversationPrint: {
    title: "会話の記録",
  },
  dataExport: {
    sectionTitle: "データの一括ダウンロード",
    sectionDescription:
      "会話の記録PDFとノートPDFをまとめてダウンロードします。容量が大きくなりにくく、保存に失敗しづらい形式です。",
    rangeLabel: "対象期間",
    rangeAll: "全期間",
    rangeLast90Days: "直近90日",
    rangeLast365Days: "直近1年",
    includeAudioLabel: "録音ファイルも含める（容量が大きくなります）",
    includeAudioHint:
      "録音を含めると処理時間・通信量が大きくなります。必要な録音だけ個別にダウンロードする方法がおすすめです。",
    buttonLabel: "すべてのデータをダウンロード",
    exporting: "データを準備しています...",
    exportSuccess: "ダウンロードが始まりました",
    exportFailed: "ダウンロードに失敗しました。もう一度お試しください。",
    exportBusy:
      "現在ダウンロード処理が混み合っています。しばらく待ってからお試しください。",
    exportTooLarge:
      "データ件数が多いため一括ダウンロードできません。期間を分けて実行してください。",
    exportAudioTooLarge:
      "録音付きでは件数が多すぎます。録音を外してダウンロードしてください。",
    exportCooldown:
      "連続でダウンロードを実行できません。少し待ってから再度お試しください。",
    exportInvalidRange:
      "対象期間の指定が正しくありません。期間を選び直してお試しください。",
  },
  deletion: {
    description:
      "これまでの会話やノートの記録がすべて消えます。一度消すと元に戻せませんのでご注意ください。",
    confirm:
      "会話の記録、ノートの内容、お名前の設定がすべて消えます。消した記録は元に戻せません。本当に消してよろしいですか？",
    blocked:
      "ノートが開封済み（または手続き中）のため、記録を消すことはできません。ご家族がノートを閲覧できる状態です。",
  },
  accountDeletion: {
    description:
      "このアプリの利用をやめます。30日間は記録がそのまま保管され、ログインすればいつでも復元できます。30日を過ぎるとすべての記録が完全に消えます。",
    firstConfirm:
      "退会すると、30日間の猶予期間に入ります。\n\n猶予期間中にログインすれば、ボタンひとつで退会を取り消せます。記録はすべてそのまま保管されます。\n\nただし、退会と同時に共有リンクは無効になります。\n\n30日が経過すると、以下のすべてが完全に削除されます：\n\n・会話の記録とノート\n・家族の登録情報\n・共有リンク\n・お名前の設定",
    secondConfirm:
      "最後の確認です。退会してよろしいですか？\n\n30日以内にログインすれば、ボタンひとつで元どおりにできます。",
    blocked: "ノートが保護されている状態では退会できません。",
    deactivated: "退会手続き中です。",
  },
  reactivation: {
    title: "退会手続き中です",
    description:
      "記録はすべて安全に保管されています。下のボタンを押すだけで、退会を取り消してすべての記録を元どおりにできます。",
    scheduledDeletionLabel: "この日を過ぎると復元できなくなります",
    reactivateButton: "アカウントを復元する",
    reactivating: "復元しています...",
    reactivated: "アカウントを復元しました。すべての記録が元どおりになりました",
    reactivateFailed:
      "復元に失敗しました。しばらくしてからもう一度お試しください。",
    logoutButton: "ログアウト",
    shareLinkNote:
      "退会手続き中のため、共有リンクは無効になっています。復元後に新しく作成できます。",
  },
} as const;

// --- Invitation acceptance screen ---
/** Delay (ms) before auto-navigating to app after successful invitation acceptance. */
export const INVITATION_SUCCESS_DELAY_MS = 2000;

/** URL path prefix for invitation links. */
export const INVITE_PATH_PREFIX = "/invite/";

/** localStorage key for invitation tokens deferred with "あとで確認する". */
export const PENDING_INVITE_STORAGE_KEY = "pending_invite_token";

export const INVITATION_MESSAGES = {
  screenTitle: "家族の招待",
  loadingText: "招待情報を確認しています...",
  fromUser: "さんからの招待です",
  relationshipLabel: "続柄",
  roleLabel: "役割",
  roleRepresentative: "代表者",
  roleMember: "家族",
  expiresLabel: "有効期限",
  acceptButton: "招待を受ける",
  acceptingButton: "登録しています...",
  skipLink: "あとで確認する",
  successTitle: "登録が完了しました",
  successMessage: "さんの家族として登録されました",
  startAppButton: "アプリを始める",
  notFound:
    "この招待リンクは無効です。送り主にもう一度招待してもらってください。",
  alreadyUsed: "この招待リンクはすでに使用されています。",
  selfInvite: "ご自身を家族として登録することはできません。",
  alreadyMember: "すでにこの方の家族として登録されています。",
  genericError:
    "招待の確認中にエラーが発生しました。しばらくしてからもう一度お試しください。",
  retryButton: "もう一度試す",
  backToAppButton: "アプリに戻る",
} as const;

// --- Invitation share dialog ---
export const INVITE_SHARE_MESSAGES = {
  created: "招待リンクを作成しました",
  instruction:
    "下のボタンからご家族にリンクを送ってください。LINEやメールで簡単に共有できます。",
  shareButton: "家族に送る",
  shared: "送信しました",
  copied: "コピーしました",
  closeButton: "閉じる",
  shareTitle: "おはなしノートへの招待",
  shareText:
    "おはなしノートの家族に登録してください。下のリンクを開いてログインすると登録できます。",
} as const;

// --- Text display ---
export const TRANSCRIPT_PREVIEW_MAX_LENGTH = 80;

// --- Transcript disclaimer ---
export const TRANSCRIPT_DISCLAIMER =
  "音声から自動で文字に起こしたものです。実際の会話と異なる場合がありますので、正確な内容は録音データでご確認ください。" as const;

// --- Terms consent screen messages (Japanese) ---
export const TERMS_CONSENT_MESSAGES = {
  heading: "ご利用にあたって",
  updateHeading: "利用規約が更新されました",
  updateDescription:
    "利用規約またはプライバシーポリシーが更新されました。内容をご確認のうえ、再度同意をお願いいたします。",
  summaryTitle: "本サービスについて",
  viewTermsButton: "利用規約を読む",
  viewPrivacyButton: "プライバシーポリシーを読む",
  agreeCheckbox: "利用規約とプライバシーポリシーに同意します",
  submitButton: "同意して始める",
  submittingButton: "確認しています...",
  termsTitle: "利用規約",
  privacyTitle: "プライバシーポリシー",
  consentError: "同意の記録に失敗しました。もう一度お試しください。",
  backButton: "戻る",
  printButton: "印刷する",
  settingsSectionTitle: "利用規約・プライバシーポリシー",
  settingsViewTerms: "利用規約を見る",
  settingsViewPrivacy: "プライバシーポリシーを見る",
} as const;

// --- Wellness (見守り) feature messages (Japanese) ---
export const WELLNESS_MESSAGES = {
  activation: {
    title: "見守り機能をはじめる",
    description:
      "毎日のおしゃべり状況を、あなたが決めた範囲でご家族に伝えます。",
    nonSurveillance:
      "監視する機能ではありません。共有内容はいつでも変更・停止できます。",
    consentLabel: "上記の内容に同意します",
    startButton: "始める",
    laterButton: "あとで",
    saving: "設定を保存しています...",
    activateSuccess: "見守り機能を始めました",
    activateFailed: "設定の保存に失敗しました。もう一度お試しください。",
    consentRequired: "同意にチェックを入れてください",
    prerequisiteTitle: "見守り機能をご利用いただくには",
    prerequisiteMessage:
      "先にご家族の登録が必要です。見守り情報の送り先となるご家族を招待してください。",
    navigateToFamilyButton: "家族画面へ",
  },
  shareLevel: {
    basic: "基本だけ",
    basicDescription: "会話回数などの基本情報のみ共有します",
    summary: "要約も共有",
    summaryDescription: "基本情報に加えて、短い週間まとめを共有します",
    detailed: "詳細共有",
    detailedDescription: "必要な変化点も含めて共有します",
  },
  settings: {
    sectionTitle: "見守り機能",
    sectionDescription: "ご家族に日々の会話状況をお知らせします",
    enabledLabel: "見守りを使う",
    shareLevelLabel: "共有する範囲",
    deliveryDayLabel: "週次まとめの配信日",
    pauseDurationLabel: "お休みする期間",
    pauseButton: "しばらく見守りをお休みする",
    resumeButton: "見守りを再開する",
    pausedUntilLabel: "お休み中",
    pausedDescription:
      "この期間中は、ご家族への見守り通知と週間まとめを止めます。",
    currentShareInfo: "現在共有中の情報",
    lastUpdatedLabel: "最終更新",
    saveFailed: "設定の保存に失敗しました。もう一度お試しください。",
    saveSuccess: "見守り設定を更新しました",
    pauseSuccess: "見守りを一時停止しました",
    resumeSuccess: "見守りを再開しました",
    pauseFailed: "一時停止の設定に失敗しました。もう一度お試しください。",
    resumeFailed: "再開の設定に失敗しました。もう一度お試しください。",
    confirmShareLevelChange: "共有範囲を変更してもよろしいですか？",
    notStarted: "見守り機能はまだ始まっていません",
    startButton: "見守りを始める",
    loadingText: "読み込み中...",
    loadFailed: "見守り設定の読み込みに失敗しました。",
    retryButton: "もう一度読み込む",
    disabledMessage: "見守り機能は現在オフです",
    reEnableButton: "見守りをもう一度始める",
    disableButton: "見守りをやめる",
    disableConfirmTitle: "見守りをやめる",
    disableConfirmMessage:
      "見守り機能を停止してもよろしいですか？ご家族への情報共有がすべて止まります。",
    pauseConfirmTemplate: "ご家族への見守り通知と週間まとめを止めます。",
    resumeConfirmMessage: "見守りを再開してもよろしいですか？",
    shareLevelBasicInfo: "会話回数などの基本情報",
    shareLevelSummaryInfo: "基本情報 + 週間まとめ",
    shareLevelDetailedInfo: "基本情報 + 週間まとめ + 変化点",
  },
  ownerStatus: {
    title: "見守り状況",
    engagedDaysLabel: "直近7日の会話回数",
    daysUnit: "日",
    missedStreakLabel: "連続未接触",
    shareLevelLabel: "共有レベル",
    noData: "まだ記録がありません",
  },
  familySummary: {
    title: "見守りサマリー",
    engagedDaysLabel: "今週の会話日数",
    statusStable: "安定",
    statusWarning: "注意",
    statusUrgent: "要確認",
    stableMessage: "今週は安定して会話できています。",
    warningMessage: "2日連続で会話がありません。ご連絡をおすすめします。",
    urgentMessage:
      "3日以上会話が確認できていません。早めのご確認をお願いします。",
    noData: "まだ見守りデータがありません",
    emptyDescription: "見守りが始まると、ここに1週間の会話状況が表示されます。",
    notEnabled: "この方は見守り機能を利用されていません",
    notEnabledDescription:
      "ご本人が見守りを始めると、ここに会話状況が表示されます。",
    requestHint:
      "次にお会いになったとき、見守り機能のことをお話しされてみてはいかがでしょうか。ご本人の「家族」画面から簡単に始められます。",
    highlightsLabel: "変化点",
    lastContactLabel: "最終接触",
    missedStreakLabel: "連続未接触",
    daysUnit: "日",
    warningAction: "お電話やメッセージで様子を聞いてみてください。",
    urgentAction: "早めにお電話でご確認をお願いします。",
    periodLabel: "期間",
    loadFailed: "見守りサマリーの読み込みに失敗しました。",
    retryButton: "もう一度読み込む",
    pausedLabel: "お休み中",
    pausedDescription: "ご本人が見守りを一時停止しています。",
  },
  weekdays: [
    "月曜日",
    "火曜日",
    "水曜日",
    "木曜日",
    "金曜日",
    "土曜日",
    "日曜日",
  ] as readonly string[],
  pauseDurations: {
    oneWeek: "1週間",
    twoWeeks: "2週間",
    oneMonth: "1ヶ月",
  },
} as const;

export const WELLNESS_PROMPT_MESSAGES = {
  title: "見守り機能のご案内",
  descriptionWithFamily:
    "毎日のおしゃべり状況を、ご登録のご家族にお知らせできます。ご家族も安心です。",
  descriptionNoFamily:
    "ご家族を先に登録しておくと、見守り機能をご利用いただけます。",
  nonSurveillance:
    "監視する機能ではありません。共有内容はいつでも変更・停止できます。",
  startButton: "見守りを始める",
  inviteFamilyButton: "家族を招待する",
  laterButton: "あとで",
  settingsHint:
    "詳しい設定は「設定」画面の「見守り機能」からいつでも変更できます。",
} as const;

export const WELLNESS_PROMPT_DISMISSED_STORAGE_KEY =
  "wellness_prompt_dismissed";

export const WELLNESS_PROMPT_DISMISS_DAYS = 7;
