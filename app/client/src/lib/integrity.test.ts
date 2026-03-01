import { describe, it, expect } from "vitest";

import {
  buildCanonicalContent,
  computeContentHash,
  computeBlobHash,
  verifyRecordIntegrity,
} from "./integrity";

import type { ConversationRecord, AudioRecording } from "../types/conversation";

function makeRecord(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id: "test-id-1",
    category: "memories",
    characterId: "character-a",
    startedAt: 1700000000000,
    endedAt: 1700000600000,
    transcript: [
      { role: "assistant", text: "Hello", timestamp: 1700000000000 },
      { role: "user", text: "Hi there", timestamp: 1700000001000 },
    ],
    summary: "A test conversation summary.",
    summaryStatus: "completed",
    audioAvailable: false,
    ...overrides,
  };
}

describe("buildCanonicalContent", () => {
  it("produces identical output for the same record regardless of property order", () => {
    const record1: ConversationRecord = {
      id: "abc",
      category: "memories",
      characterId: "character-a",
      startedAt: 1000,
      endedAt: 2000,
      transcript: [{ role: "user", text: "hello", timestamp: 1000 }],
      summary: "summary",
      summaryStatus: "completed",
      audioAvailable: true,
    };

    // Same data but different property insertion order
    const record2: ConversationRecord = {
      audioAvailable: true,
      summary: "summary",
      transcript: [{ role: "user", text: "hello", timestamp: 1000 }],
      endedAt: 2000,
      startedAt: 1000,
      characterId: "character-a",
      category: "memories",
      id: "abc",
      summaryStatus: "completed",
    };

    expect(buildCanonicalContent(record1)).toBe(buildCanonicalContent(record2));
  });

  it("includes transcript, summary, noteEntries, and keyPoints", () => {
    const record = makeRecord({
      noteEntries: [
        {
          questionId: "q1",
          questionTitle: "Question 1",
          answer: "Answer 1",
        },
      ],
      keyPoints: {
        importantStatements: ["stmt1"],
        decisions: ["dec1"],
        undecidedItems: [],
      },
    });

    const canonical = buildCanonicalContent(record);
    const parsed: unknown = JSON.parse(canonical);

    expect(parsed).toHaveProperty("transcript");
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("noteEntries");
    expect(parsed).toHaveProperty("keyPoints");
  });

  it("excludes metadata fields", () => {
    const record = makeRecord({
      summaryStatus: "completed",
      audioAvailable: true,
      coveredQuestionIds: ["q1", "q2"],
      oneLinerSummary: "short summary",
      discussedCategories: ["memories", "people"],
      integrityHash: "somehash",
      audioHash: "someaudiohash",
      integrityHashedAt: 1700000000000,
    });

    const canonical = buildCanonicalContent(record);
    const parsed: unknown = JSON.parse(canonical);
    const obj = parsed as Record<string, unknown>;

    expect(obj["summaryStatus"]).toBeUndefined();
    expect(obj["audioAvailable"]).toBeUndefined();
    expect(obj["coveredQuestionIds"]).toBeUndefined();
    expect(obj["oneLinerSummary"]).toBeUndefined();
    expect(obj["discussedCategories"]).toBeUndefined();
    expect(obj["integrityHash"]).toBeUndefined();
    expect(obj["audioHash"]).toBeUndefined();
    expect(obj["integrityHashedAt"]).toBeUndefined();
  });

  it("handles records with undefined optional fields", () => {
    const record = makeRecord({
      noteEntries: undefined,
      keyPoints: undefined,
    });

    const canonical = buildCanonicalContent(record);
    expect(canonical).toBeTruthy();
    expect(() => JSON.parse(canonical) as unknown).not.toThrow();
  });
});

describe("computeContentHash", () => {
  it("produces consistent hash for the same record", async () => {
    const record = makeRecord();
    const hash1 = await computeContentHash(record);
    const hash2 = await computeContentHash(record);
    expect(hash1).toBe(hash2);
  });

  it("produces same hash when metadata differs but content is identical", async () => {
    const record1 = makeRecord({
      summaryStatus: "completed",
      audioAvailable: true,
    });
    const record2 = makeRecord({
      summaryStatus: "pending",
      audioAvailable: false,
    });

    const hash1 = await computeContentHash(record1);
    const hash2 = await computeContentHash(record2);
    expect(hash1).toBe(hash2);
  });

  it("produces different hash when transcript is modified", async () => {
    const record1 = makeRecord();
    const record2 = makeRecord({
      transcript: [
        { role: "assistant", text: "Hello", timestamp: 1700000000000 },
        { role: "user", text: "Modified text", timestamp: 1700000001000 },
      ],
    });

    const hash1 = await computeContentHash(record1);
    const hash2 = await computeContentHash(record2);
    expect(hash1).not.toBe(hash2);
  });

  it("produces different hash when summary is modified", async () => {
    const record1 = makeRecord({ summary: "Original summary" });
    const record2 = makeRecord({ summary: "Modified summary" });

    const hash1 = await computeContentHash(record1);
    const hash2 = await computeContentHash(record2);
    expect(hash1).not.toBe(hash2);
  });

  it("produces different hash when noteEntries are modified", async () => {
    const record1 = makeRecord({
      noteEntries: [
        { questionId: "q1", questionTitle: "Q1", answer: "Answer A" },
      ],
    });
    const record2 = makeRecord({
      noteEntries: [
        { questionId: "q1", questionTitle: "Q1", answer: "Answer B" },
      ],
    });

    const hash1 = await computeContentHash(record1);
    const hash2 = await computeContentHash(record2);
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 64-character hex string (SHA-256)", async () => {
    const hash = await computeContentHash(makeRecord());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("computeBlobHash", () => {
  it("produces consistent hash for the same blob", async () => {
    const blob = new Blob(["test audio data"], { type: "audio/webm" });
    const hash1 = await computeBlobHash(blob);
    const hash2 = await computeBlobHash(blob);
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different content", async () => {
    const blob1 = new Blob(["audio data 1"], { type: "audio/webm" });
    const blob2 = new Blob(["audio data 2"], { type: "audio/webm" });
    const hash1 = await computeBlobHash(blob1);
    const hash2 = await computeBlobHash(blob2);
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 64-character hex string (SHA-256)", async () => {
    const blob = new Blob(["data"], { type: "audio/webm" });
    const hash = await computeBlobHash(blob);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyRecordIntegrity", () => {
  it("returns 'verified' for record with valid content hash", async () => {
    const record = makeRecord();
    const hash = await computeContentHash(record);
    record.integrityHash = hash;

    const result = await verifyRecordIntegrity(record, null);
    expect(result.contentStatus).toBe("verified");
    expect(result.conversationId).toBe("test-id-1");
  });

  it("returns 'tampered' for record with mismatched content hash", async () => {
    const record = makeRecord({ integrityHash: "wrong-hash-value" });

    const result = await verifyRecordIntegrity(record, null);
    expect(result.contentStatus).toBe("tampered");
  });

  it("returns 'no-hash' for legacy record without integrityHash", async () => {
    const record = makeRecord();

    const result = await verifyRecordIntegrity(record, null);
    expect(result.contentStatus).toBe("no-hash");
  });

  it("returns 'verified' for record with valid audio hash", async () => {
    const blob = new Blob(["test audio"], { type: "audio/webm" });
    const audioHash = await computeBlobHash(blob);
    const record = makeRecord({ audioHash });
    const audioRecording: AudioRecording = {
      conversationId: "test-id-1",
      blob,
      mimeType: "audio/webm",
      createdAt: 1700000000000,
    };

    const result = await verifyRecordIntegrity(record, audioRecording);
    expect(result.audioStatus).toBe("verified");
  });

  it("returns 'tampered' when audio hash exists but audio is missing", async () => {
    const record = makeRecord({ audioHash: "some-audio-hash" });

    const result = await verifyRecordIntegrity(record, null);
    expect(result.audioStatus).toBe("tampered");
  });

  it("returns 'tampered' when audio blob has been modified", async () => {
    const originalBlob = new Blob(["original audio"], { type: "audio/webm" });
    const audioHash = await computeBlobHash(originalBlob);
    const record = makeRecord({ audioHash });

    const modifiedBlob = new Blob(["modified audio"], { type: "audio/webm" });
    const audioRecording: AudioRecording = {
      conversationId: "test-id-1",
      blob: modifiedBlob,
      mimeType: "audio/webm",
      createdAt: 1700000000000,
    };

    const result = await verifyRecordIntegrity(record, audioRecording);
    expect(result.audioStatus).toBe("tampered");
  });

  it("returns 'no-hash' for audio when audioHash is not set", async () => {
    const record = makeRecord();

    const result = await verifyRecordIntegrity(record, null);
    expect(result.audioStatus).toBe("no-hash");
  });
});
