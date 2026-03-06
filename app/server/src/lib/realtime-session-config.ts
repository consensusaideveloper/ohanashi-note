const CATEGORY_ENUM = [
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
] as const;

const VALID_VOICES = new Set(["shimmer", "echo", "coral"]);
const VALID_SILENCE_DURATION_MS = new Set([500, 800, 1500]);
const VALID_TOOL_NAMES = new Set([
  "search_my_information",
  "search_past_conversations",
  "get_note_entries",
  "get_current_settings",
  "get_current_screen_context",
  "get_recommended_next_action",
  "get_family_status",
  "navigate_to_screen",
  "view_note_category",
  "filter_conversation_history",
  "change_font_size",
  "change_character",
  "update_user_name",
  "update_assistant_name",
  "update_speaking_preferences",
  "start_focused_conversation",
  "create_family_invitation",
  "update_access_preset",
  "complete_onboarding",
  "end_conversation",
]);
const NORMAL_TOOL_NAMES = new Set([
  "search_my_information",
  "search_past_conversations",
  "get_note_entries",
  "get_current_settings",
  "get_current_screen_context",
  "get_recommended_next_action",
  "get_family_status",
  "navigate_to_screen",
  "view_note_category",
  "filter_conversation_history",
  "change_font_size",
  "change_character",
  "update_user_name",
  "update_assistant_name",
  "update_speaking_preferences",
  "start_focused_conversation",
  "create_family_invitation",
  "update_access_preset",
  "end_conversation",
]);
const ONBOARDING_TOOL_NAMES = new Set([
  "update_user_name",
  "update_assistant_name",
  "change_character",
  "change_font_size",
  "update_speaking_preferences",
  "complete_onboarding",
  "end_conversation",
]);

export interface TurnDetection {
  type: "server_vad";
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  create_response: true;
}

export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ValidatedRealtimeSessionConfig {
  voice: string;
  tools: readonly ToolDefinition[];
  turnDetection: TurnDetection;
}

const ALL_REALTIME_TOOLS: readonly ToolDefinition[] = [
  {
    type: "function",
    name: "search_my_information",
    description: "過去の会話とノートを横断して情報を検索します。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string", enum: CATEGORY_ENUM },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "search_past_conversations",
    description: "過去の会話から関連する内容を検索します。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string", enum: CATEGORY_ENUM },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_note_entries",
    description: "指定カテゴリのエンディングノート内容を取得します。",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORY_ENUM },
      },
      required: ["category"],
    },
  },
  {
    type: "function",
    name: "get_current_settings",
    description: "現在の設定内容を取得します。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "get_current_screen_context",
    description: "現在表示中の画面情報を取得します。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "get_recommended_next_action",
    description: "現在の状況でおすすめの次の行動を案内します。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "get_family_status",
    description: "登録済みの家族と開封設定を取得します。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "navigate_to_screen",
    description: "アプリの画面を切り替えます。",
    parameters: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          enum: ["conversation", "note", "history", "settings", "family"],
        },
      },
      required: ["screen"],
    },
  },
  {
    type: "function",
    name: "view_note_category",
    description: "エンディングノートの指定カテゴリを表示します。",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORY_ENUM },
      },
      required: ["category"],
    },
  },
  {
    type: "function",
    name: "filter_conversation_history",
    description: "会話履歴をカテゴリで絞り込んで表示します。",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORY_ENUM },
      },
    },
  },
  {
    type: "function",
    name: "change_font_size",
    description: "文字の大きさを変更します。",
    parameters: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["standard", "large", "x-large"],
        },
      },
      required: ["level"],
    },
  },
  {
    type: "function",
    name: "change_character",
    description: "話し相手のキャラクターを変更します。",
    parameters: {
      type: "object",
      properties: {
        character_name: {
          type: "string",
          enum: ["のんびり", "しっかり", "にこにこ"],
        },
      },
      required: ["character_name"],
    },
  },
  {
    type: "function",
    name: "update_user_name",
    description: "ユーザーの表示名を変更します。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "update_assistant_name",
    description: "話し相手の呼び名を変更します。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "update_speaking_preferences",
    description: "話し方の設定を変更します。",
    parameters: {
      type: "object",
      properties: {
        speaking_speed: {
          type: "string",
          enum: ["slow", "normal", "fast"],
        },
        silence_duration: {
          type: "string",
          enum: ["short", "normal", "long"],
        },
        confirmation_level: {
          type: "string",
          enum: ["frequent", "normal", "minimal"],
        },
      },
    },
  },
  {
    type: "function",
    name: "start_focused_conversation",
    description: "指定テーマで新しい会話を始めます。",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORY_ENUM },
      },
      required: ["category"],
    },
  },
  {
    type: "function",
    name: "create_family_invitation",
    description: "家族の招待リンクを作成します。",
    parameters: {
      type: "object",
      properties: {
        relationship: {
          type: "string",
          enum: ["spouse", "child", "sibling", "grandchild", "other"],
        },
        relationship_label: { type: "string" },
      },
      required: ["relationship", "relationship_label"],
    },
  },
  {
    type: "function",
    name: "update_access_preset",
    description: "開封設定を変更します。",
    parameters: {
      type: "object",
      properties: {
        family_member_name: { type: "string" },
        category: { type: "string", enum: CATEGORY_ENUM },
        action: { type: "string", enum: ["grant", "revoke"] },
      },
      required: ["family_member_name", "category", "action"],
    },
  },
  {
    type: "function",
    name: "complete_onboarding",
    description: "オンボーディング設定の完了を確定します。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "end_conversation",
    description: "会話を終了して保存します。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

export function validateRealtimeSessionConfig(
  sessionConfig: unknown,
  onboarding: boolean,
): ValidatedRealtimeSessionConfig | null {
  if (typeof sessionConfig !== "object" || sessionConfig === null) {
    return null;
  }

  const raw = sessionConfig as Record<string, unknown>;

  if (!Array.isArray(raw["tools"])) {
    return null;
  }

  const requestedToolNames = new Set<string>();
  for (const tool of raw["tools"]) {
    if (typeof tool !== "object" || tool === null) {
      return null;
    }
    const name = (tool as Record<string, unknown>)["name"];
    if (typeof name !== "string" || !VALID_TOOL_NAMES.has(name)) {
      return null;
    }
    requestedToolNames.add(name);
  }

  const voice = raw["voice"];
  if (typeof voice !== "string" || !VALID_VOICES.has(voice)) {
    return null;
  }

  const turnDetection = validateTurnDetection(raw["turn_detection"]);
  if (turnDetection === null) {
    return null;
  }

  const approvedTools = ALL_REALTIME_TOOLS.filter((tool) =>
    onboarding
      ? ONBOARDING_TOOL_NAMES.has(tool.name)
      : NORMAL_TOOL_NAMES.has(tool.name),
  );

  const requiredTools = onboarding ? ONBOARDING_TOOL_NAMES : NORMAL_TOOL_NAMES;
  if (approvedTools.length !== requiredTools.size) {
    return null;
  }

  return {
    voice,
    tools: approvedTools,
    turnDetection,
  };
}

function validateTurnDetection(value: unknown): TurnDetection | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const silenceDurationMs = raw["silence_duration_ms"];
  if (
    raw["type"] !== "server_vad" ||
    typeof silenceDurationMs !== "number" ||
    !VALID_SILENCE_DURATION_MS.has(silenceDurationMs)
  ) {
    return null;
  }

  return {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: silenceDurationMs,
    create_response: true,
  };
}
