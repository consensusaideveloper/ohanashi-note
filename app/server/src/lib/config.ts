import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";

// Load .env from the app root (one level up from server/)
dotenvConfig({ path: resolve(import.meta.dirname, "../../../.env") });

type LogLevel = "debug" | "info" | "warn" | "error";

interface FirebaseAdminConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

interface OpenAIModelConfig {
  realtime: string;
  realtimeTranscription: string;
  retranscription: string;
  summarizer: string;
  summarizerTemperature: number;
  todo: string;
}

interface Config {
  openaiApiKey: string;
  port: number;
  nodeEnv: "development" | "production";
  allowedOrigins: string[];
  logLevel: LogLevel;
  openaiModels: OpenAIModelConfig;
  firebaseAdmin: FirebaseAdminConfig;
  r2: R2Config | null;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function getOptionalNumberEnv(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(rawValue);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Invalid numeric environment variable: ${name}=${rawValue}`,
    );
  }
  return parsed;
}

export function loadConfig(): Config {
  return {
    openaiApiKey: getRequiredEnv("OPENAI_API_KEY"),
    port: parseInt(getOptionalEnv("PORT", "3000"), 10),
    nodeEnv: getOptionalEnv("NODE_ENV", "development") as
      | "development"
      | "production",
    allowedOrigins: getOptionalEnv("ALLOWED_ORIGINS", "http://localhost:5173")
      .split(",")
      .map((o) => o.trim()),
    logLevel: getOptionalEnv("LOG_LEVEL", "info") as LogLevel,
    openaiModels: {
      realtime: getOptionalEnv("OPENAI_REALTIME_MODEL", "gpt-realtime-mini"),
      realtimeTranscription: getOptionalEnv(
        "OPENAI_REALTIME_TRANSCRIPTION_MODEL",
        "gpt-4o-mini-transcribe",
      ),
      retranscription: getOptionalEnv(
        "OPENAI_RETRANSCRIPTION_MODEL",
        "gpt-4o-mini-transcribe",
      ),
      summarizer: getOptionalEnv("OPENAI_SUMMARIZER_MODEL", "gpt-5-mini"),
      summarizerTemperature: getOptionalNumberEnv(
        "OPENAI_SUMMARIZER_TEMPERATURE",
        0.2,
      ),
      todo: getOptionalEnv("OPENAI_TODO_MODEL", "gpt-5-nano"),
    },
    firebaseAdmin: {
      projectId: getRequiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getRequiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    },
    r2: loadR2Config(),
  };
}

function loadR2Config(): R2Config | null {
  const accountId = process.env["R2_ACCOUNT_ID"];
  if (!accountId) {
    return null;
  }
  return {
    accountId,
    accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    bucketName: getOptionalEnv("R2_BUCKET_NAME", "ohanashi-media"),
  };
}
