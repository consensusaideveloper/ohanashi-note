import { describe, expect, it } from "vitest";

import { buildHybridTranscript } from "./transcriber";

describe("buildHybridTranscript", () => {
  it("appends a synthetic user turn when original transcript has no user turns", () => {
    const result = buildHybridTranscript(
      [
        { role: "assistant", text: "好きな食べ物はありますか", timestamp: 1000 },
        { role: "assistant", text: "ほかにもあれば教えてください", timestamp: 2000 },
      ],
      {
        text: "みかんとそばが好きです",
        segments: [],
      },
    );

    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({
      role: "user",
      text: "みかんとそばが好きです",
      timestamp: 2001,
    });
  });

  it("fills empty user turns instead of dropping re-transcribed text", () => {
    const result = buildHybridTranscript(
      [
        { role: "assistant", text: "好きな食べ物を教えてください", timestamp: 1000 },
        { role: "user", text: "", timestamp: 2000 },
        { role: "assistant", text: "飲み物も教えてください", timestamp: 3000 },
        { role: "user", text: "", timestamp: 4000 },
      ],
      {
        text: "そばが好きです。飲み物はお茶が好きです。",
        segments: [],
      },
    );

    const userTexts = result
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.text);

    expect(userTexts.join("")).toContain("そばが好きです");
    expect(userTexts.join("")).toContain("飲み物はお茶が好きです");
    expect(userTexts.every((text) => text.trim().length > 0)).toBe(true);
  });

  it("replaces a single empty user turn with the full re-transcribed text", () => {
    const result = buildHybridTranscript(
      [
        { role: "assistant", text: "教えてください", timestamp: 1000 },
        { role: "user", text: "", timestamp: 2000 },
      ],
      {
        text: "甘いものよりせんべいが好きです",
        segments: [],
      },
    );

    expect(result[1]).toMatchObject({
      role: "user",
      text: "甘いものよりせんべいが好きです",
      timestamp: 2000,
    });
  });
});
