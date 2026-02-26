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

interface Config {
  openaiApiKey: string;
  port: number;
  nodeEnv: "development" | "production";
  allowedOrigins: string[];
  logLevel: LogLevel;
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
