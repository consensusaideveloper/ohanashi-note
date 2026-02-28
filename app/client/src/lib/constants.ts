import type {
  FontSizeLevel,
  SpeakingSpeed,
  SilenceDuration,
  ConfirmationLevel,
} from "../types/conversation";

// WebSocket URL — in development, Vite proxy handles /ws
// In production, same origin serves both static files and WebSocket
export const WS_URL =
  import.meta.env.MODE === "production"
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.host}/ws`;

// Reconnection settings
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 10000;

// Audio settings
export const AUDIO_SAMPLE_RATE = 24000;
export const AUDIO_BUFFER_SIZE = 4096;

// --- Echo suppression settings ---
/** Cooldown period (ms) after AI finishes speaking before re-enabling mic input. */
export const POST_SPEECH_COOLDOWN_MS = 1500;
/** Minimum character count for a user transcript to be considered valid input. */
export const MIN_TRANSCRIPT_LENGTH = 2;
/** RMS threshold for barge-in detection during AI speech. */
export const BARGE_IN_RMS_THRESHOLD = 0.15;
/** Number of consecutive audio chunks above RMS threshold to confirm barge-in. */
export const BARGE_IN_CONSECUTIVE_CHUNKS = 2;

// OpenAI Realtime API session config (voice is set dynamically per character)
export const SESSION_CONFIG = {
  modalities: ["text", "audio"] as Array<"text" | "audio">,
  input_audio_format: "pcm16" as const,
  output_audio_format: "pcm16" as const,
  input_audio_transcription: { model: "whisper-1", language: "ja" },
  turn_detection: {
    type: "server_vad" as const,
    threshold: 0.7, // raised from 0.5 for mobile noise rejection
    prefix_padding_ms: 300,
    silence_duration_ms: 1200, // raised from 1000 for natural pauses
  },
  temperature: 0.7,
} as const;

// Function calling tools for the Realtime API session
export const REALTIME_TOOLS = [
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
  // --- Lifecycle tools ---
  {
    type: "function" as const,
    name: "end_conversation",
    description:
      "会話を終了してデータを保存します。ユーザーが「もう疲れた」「また今度」「今日はここまで」「もう大丈夫」「ありがとう、終わりにしよう」など、会話を終えたい意思を表現した場合に使用してください。特定のキーワードではなく、文脈からユーザーの終了意図を判断してください。",
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
  { value: "slow", label: "ゆっくり", description: "短い文で、一つずつ丁寧に" },
  { value: "normal", label: "ふつう", description: "自然な速さで" },
  { value: "fast", label: "すこし速め", description: "テキパキと" },
] as const;

/** Silence duration options for settings UI. */
export const SILENCE_DURATION_OPTIONS: readonly {
  readonly value: SilenceDuration;
  readonly label: string;
  readonly description: string;
}[] = [
  { value: "short", label: "短め", description: "すぐに次を話す" },
  { value: "normal", label: "ふつう", description: "少し待ってから" },
  { value: "long", label: "長め", description: "ゆっくり考えてから話せる" },
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
    description: "大事なことを繰り返す",
  },
  { value: "normal", label: "ふつう", description: "ときどき確認する" },
  {
    value: "minimal",
    label: "あまり確認しない",
    description: "どんどん進める",
  },
] as const;

/** Default speaking preference values. */
export const DEFAULT_SPEAKING_SPEED: SpeakingSpeed = "normal";
export const DEFAULT_SILENCE_DURATION: SilenceDuration = "normal";
export const DEFAULT_CONFIRMATION_LEVEL: ConfirmationLevel = "normal";

/** Map silence duration preference to VAD silence_duration_ms values. */
export const SILENCE_DURATION_MS_MAP: Record<SilenceDuration, number> = {
  short: 800,
  normal: 1200,
  long: 2000,
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
      "本日の会話回数の上限に達しました。また明日お話ししましょう。",
    unknown: "うまくいきませんでした。もう一度お試しください。",
    saveFailed: "保存できませんでした。もう一度お試しください。",
    printLoadFailed:
      "印刷用のデータを読み込めませんでした。もう一度お試しください。",
    deleteFailed: "削除できませんでした。もう一度お試しください。",
    summaryFailed:
      "お話のまとめを作れませんでした。会話の内容は保存されていますのでご安心ください。",
    noteLoadFailed: "ノートの内容を読み込めませんでした。",
    historyLoadFailed: "会話の記録を読み込めませんでした。",
    loadFailed: "データの読み込みに失敗しました。もう一度お試しください。",
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
      "逝去報告を取り消しますか？ステータスが「活動中」に戻ります。",
    initiateConsentMessage:
      "ノート開封のための同意収集を開始します。全家族に通知が送信されます。",
    consentDialogTitle: "ノート開封への同意",
    consentExplanation:
      "ご家族のノートを開封するためには、全員の同意が必要です。",
    consentAgreeButton: "同意する",
    consentDeclineButton: "同意しない",
    consentDetailExplanation:
      "同意するとノートが開封され、中身を見ることができるようになります。一度同意すると取り消すことはできませんのでご注意ください。",
    consentGiven: "同意しました",
    consentDeclined: "同意しませんでした",
    consentPending: "未回答",
    noteOpened: "ノートが開封されました",
    dashboardDescription: "紐付いている方のノートを確認できます",
    noteViewTitle: "ノートの閲覧",
    accessManagerTitle: "アクセス管理",
    accessManagerDescription:
      "家族ごとにノートのカテゴリへのアクセス権を管理します",
    participantAccessTitle: "参加者・アクセス管理",
    participantAccessButton: "参加者・アクセス管理",
    allCategoriesAccessible: "全カテゴリ閲覧可",
    accessSummary: "カテゴリ閲覧可",
    categoryGranted: "アクセスを許可しました",
    categoryRevoked: "アクセスを取り消しました",
    noAccessibleCategories: "閲覧可能なカテゴリがありません",
    noAccessibleCategoriesMemberHint:
      "代表者がノートのアクセス権を管理しています。閲覧可能なカテゴリが追加されるまでお待ちください。",
    noAccessibleCategoriesRepresentativeHint:
      "アクセス管理画面からカテゴリの閲覧権限を設定できます。",
    noteNotOpened: "ノートはまだ開封されていません",
    backToCreatorList: "一覧に戻る",
    lifecycleActive: "活動中",
    lifecycleDeath: "逝去報告済み",
    lifecycleConsent: "同意収集中",
    lifecycleOpened: "開封済み",
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
    myFamilyTab: "わたしの家族",
    familyNotesTab: "家族のノート",
    pendingActionsCount: "件の対応",
    creatorDetailTitle: "詳細",
    reportDeathButton: "逝去のご報告",
    initiateConsentButton: "同意収集を開始する",
    cancelDeathReportButton: "報告を取り消す",
    resetConsentButton: "同意をやり直す",
    viewNoteButton: "ノートを見る",
    accessManageButton: "アクセス管理",
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
    memberLeft: "家族から脱退しました",
  },
  todo: {
    pageTitle: "やることリスト",
    noTodos: "まだやることが登録されていません",
    createButton: "やることを追加",
    generateButton: "自動で作成",
    generateConfirmTitle: "やることリストを自動作成",
    generateConfirmMessage:
      "ノートの内容をもとに、やるべきことを自動で作成します。作成後に編集・削除ができます。",
    statusPending: "未着手",
    statusInProgress: "対応中",
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
    dueDateLabel: "期限",
    progressLabel: "完了",
    deleteConfirmTitle: "やることを削除",
    deleteConfirmMessage: "このやることを削除してもよろしいですか？",
    updated: "更新しました",
    created: "やることを追加しました",
    deleted: "削除しました",
    commentAdded: "メモを追加しました",
    generated: "やることリストを作成しました",
    volunteered: "担当に名乗り出ました",
    statusChanged: "ステータスを変更しました",
    assigned: "担当者を設定しました",
    visibilityTitle: "表示設定",
    visibilityDescription:
      "メンバーごとにこのやることの表示/非表示を切り替えます",
    hidden: "非表示",
    visible: "表示",
    titleLabel: "タイトル",
    descriptionLabel: "詳細",
    categoryLabel: "カテゴリ",
    priorityLabel: "優先度",
    assigneeLabel: "担当者",
    statusLabel: "ステータス",
    historyTitle: "履歴",
    commentsTitle: "メモ",
    detailTitle: "やることの詳細",
    filterAll: "すべて",
    createDialogTitle: "やることを追加",
    noAssignee: "未定",
    noCategory: "指定なし",
    startButton: "着手する",
    completeButton: "完了にする",
    reopenButton: "未着手に戻す",
    deletedUser: "退会済みユーザー",
  },
  wheelPicker: {
    confirm: "決定",
    cancel: "キャンセル",
    relationshipTitle: "続柄を選択",
    assigneeTitle: "担当者を選択",
    categoryTitle: "カテゴリを選択",
  },
  datePicker: {
    title: "期限を選択",
    today: "今日",
    tomorrow: "明日",
    nextWeek: "1週間後",
    clear: "期限なし",
    confirm: "決定",
    cancel: "キャンセル",
    placeholder: "日付を選んでください",
    weekdays: ["日", "月", "火", "水", "木", "金", "土"] as readonly string[],
  },
  todoError: {
    loadFailed: "やることリストの読み込みに失敗しました",
    createFailed: "やることの追加に失敗しました",
    updateFailed: "やることの更新に失敗しました",
    deleteFailed: "やることの削除に失敗しました",
    commentFailed: "メモの追加に失敗しました",
    generateFailed: "やることリストの自動作成に失敗しました",
    volunteerFailed: "担当の登録に失敗しました",
    detailLoadFailed: "やることの詳細の読み込みに失敗しました",
    visibilityFailed: "表示設定の変更に失敗しました",
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
    accessCategoriesFailed: "アクセス可能なカテゴリの取得に失敗しました。",
    grantAccessFailed: "アクセス権の付与に失敗しました。",
    revokeAccessFailed: "アクセス権の取り消しに失敗しました。",
    noteFetchFailed: "ノートの取得に失敗しました。",
    accessPresetsFailed: "事前設定の取得に失敗しました。",
    accessPresetAddFailed: "設定の追加に失敗しました。",
    accessPresetRemoveFailed: "設定の削除に失敗しました。",
    accessPresetsRecommendationsFailed: "推奨設定の取得に失敗しました。",
    removeBlockedByLifecycle:
      "現在の状態では削除できません。しばらくしてからもう一度お試しください。",
    leaveFailed: "脱退に失敗しました。",
    leaveBlockedByLifecycle: "現在の状態では脱退できません。",
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
export const MAX_DAILY_SESSIONS = 5;

// --- WebSocket close codes (server-defined, RFC 6455 app range 4000-4999) ---
/** Server close code: daily session quota exceeded. */
export const WS_CLOSE_QUOTA_EXCEEDED = 4008;
/** Server close code: session duration limit reached. */
export const WS_CLOSE_SESSION_TIMEOUT = 4009;
/** Server close code: lifecycle status blocks new conversations. */
export const WS_CLOSE_LIFECYCLE_BLOCKED = 4004;

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
  signingIn: "ログイン中...",
  signInButton: "Googleでログイン",
  error: "ログインできませんでした。もう一度お試しください。",
  footer: "Googleアカウントで安全にログインできます",
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
const ONBOARDING_TOOL_NAMES: ReadonlySet<string> = new Set([
  "update_user_name",
  "change_character",
  "change_font_size",
  "update_speaking_preferences",
  "end_conversation",
]);

/** Subset of REALTIME_TOOLS for the onboarding conversation. */
export const ONBOARDING_TOOLS = REALTIME_TOOLS.filter((t) =>
  ONBOARDING_TOOL_NAMES.has(t.name),
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
  fontSizeLabel: "文字の大きさ",
  speakingSpeedLabel: "話し方",
  description:
    "話し相手とお話しすると、大切な想いがノートにまとめられます。\nいつでも気軽にお話ししてくださいね。",
  startButton: "はじめる",
} as const;

// --- Settings screen messages (Japanese) ---
export const SETTINGS_MESSAGES = {
  profile: {
    description:
      "お名前と話し相手を設定します。変更したら「保存する」を押してください。",
  },
  speakingPreferences: {
    title: "話し相手の話し方",
    description: "話し相手の話し方を調整できます",
    speedLabel: "話す速さ",
    silenceLabel: "待ち時間",
    confirmationLabel: "確認の頻度",
    saved: "話し方の設定を保存しました",
  },
  account: {
    description: "現在ログイン中のアカウントです",
    logoutConfirm:
      "ログアウトしてもよろしいですか？データは保存されたままです。同じアカウントで再度ログインできます。",
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
  deletion: {
    description:
      "これまでの会話やノートの記録がすべて完全に削除されます。この操作は取り消すことができません。",
    confirm:
      "会話の記録、ノートの内容、プロフィールがすべて削除されます。削除したデータは元に戻せません。本当に削除しますか？",
    blocked:
      "ノートが開封済み（または手続き中）のため、データの削除はできません。ご家族がノートを閲覧できる状態です。",
  },
  accountDeletion: {
    description:
      "アカウントを完全に削除します。すべてのデータ、家族登録、ノートが消去されます。",
    firstConfirm:
      "アカウントを削除すると、以下のすべてが完全に消去されます：\n\n・会話の記録とノート\n・家族の登録情報\n・プロフィール設定\n\n削除したデータは元に戻すことができません。",
    secondConfirm: "最後の確認です。本当にアカウントを削除してよろしいですか？",
    blocked: "ノートが保護されている状態ではアカウントを削除できません。",
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
