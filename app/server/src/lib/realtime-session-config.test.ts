import { describe, expect, it } from "vitest";

import { validateRealtimeSessionConfig } from "./realtime-session-config.js";

const validSessionConfig = {
  voice: "shimmer",
  tools: [{ name: "search_past_conversations" }, { name: "end_conversation" }],
  turn_detection: {
    type: "server_vad",
    silence_duration_ms: 800,
  },
};

describe("validateRealtimeSessionConfig", () => {
  it("returns approved tools for normal sessions", () => {
    const result = validateRealtimeSessionConfig(validSessionConfig, false);
    expect(result?.tools.map((tool) => tool.name)).toEqual([
      "search_past_conversations",
      "get_note_entries",
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
  });

  it("forces the onboarding tool subset", () => {
    const result = validateRealtimeSessionConfig(validSessionConfig, true);
    expect(result?.tools.map((tool) => tool.name)).toEqual([
      "change_font_size",
      "change_character",
      "update_user_name",
      "update_assistant_name",
      "update_speaking_preferences",
      "end_conversation",
    ]);
  });

  it("rejects invalid voice values", () => {
    expect(
      validateRealtimeSessionConfig(
        { ...validSessionConfig, voice: "alloy" },
        false,
      ),
    ).toBeNull();
  });

  it("rejects invalid silence durations", () => {
    expect(
      validateRealtimeSessionConfig(
        {
          ...validSessionConfig,
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 999,
          },
        },
        false,
      ),
    ).toBeNull();
  });
});
