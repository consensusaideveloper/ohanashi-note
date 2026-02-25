import { Hono } from "hono";
import { summarizeConversation } from "../services/summarizer.js";
import { logger } from "../lib/logger.js";

const VALID_CATEGORIES = new Set([
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
]);

const summarize = new Hono();

summarize.post("/api/summarize", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate request body
  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Request body must be a JSON object" }, 400);
  }

  const { category, transcript, previousNoteEntries } = body as Record<
    string,
    unknown
  >;

  // category can be null (guided mode) or a valid category string
  if (
    category !== null &&
    (typeof category !== "string" || !VALID_CATEGORIES.has(category))
  ) {
    return c.json(
      {
        error: `Invalid category. Must be null or one of: ${[...VALID_CATEGORIES].join(", ")}`,
      },
      400,
    );
  }

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return c.json({ error: "transcript must be a non-empty array" }, 400);
  }

  // Validate each transcript entry
  for (const entry of transcript) {
    if (typeof entry !== "object" || entry === null) {
      return c.json({ error: "Each transcript entry must be an object" }, 400);
    }
    const e = entry as Record<string, unknown>;
    if (e["role"] !== "user" && e["role"] !== "assistant") {
      return c.json(
        { error: 'Each transcript entry must have role "user" or "assistant"' },
        400,
      );
    }
    if (typeof e["text"] !== "string") {
      return c.json(
        { error: "Each transcript entry must have a text string" },
        400,
      );
    }
  }

  // Validate previousNoteEntries if present
  let validatedPreviousEntries:
    | Array<{ questionId: string; questionTitle: string; answer: string }>
    | undefined;
  if (previousNoteEntries !== undefined && previousNoteEntries !== null) {
    if (!Array.isArray(previousNoteEntries)) {
      return c.json({ error: "previousNoteEntries must be an array" }, 400);
    }
    for (const item of previousNoteEntries) {
      if (typeof item !== "object" || item === null) {
        return c.json(
          { error: "Each previousNoteEntry must be an object" },
          400,
        );
      }
      const ne = item as Record<string, unknown>;
      if (
        typeof ne["questionId"] !== "string" ||
        typeof ne["questionTitle"] !== "string" ||
        typeof ne["answer"] !== "string"
      ) {
        return c.json(
          {
            error:
              "Each previousNoteEntry must have questionId, questionTitle, and answer strings",
          },
          400,
        );
      }
    }
    validatedPreviousEntries = previousNoteEntries as Array<{
      questionId: string;
      questionTitle: string;
      answer: string;
    }>;
  }

  try {
    const result = await summarizeConversation({
      category: category as
        | "memories"
        | "people"
        | "house"
        | "medical"
        | "funeral"
        | "money"
        | "work"
        | "digital"
        | "legal"
        | "trust"
        | "support"
        | null,
      transcript: transcript as Array<{
        role: "user" | "assistant";
        text: string;
      }>,
      previousNoteEntries: validatedPreviousEntries,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Summarization failed", { error: message, category });
    return c.json({ error: "Summarization failed", detail: message }, 500);
  }
});

export { summarize };
