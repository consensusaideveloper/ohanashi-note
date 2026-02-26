import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

function getDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return url;
}

const databaseUrl = getDatabaseUrl();
const isProduction = process.env["NODE_ENV"] === "production";

// Log connection info at startup (host only, no credentials)
try {
  const parsed = new URL(databaseUrl);
  console.info(
    `[DB] Connecting to ${parsed.hostname}:${parsed.port}${parsed.pathname} (ssl=${String(isProduction)})`,
  );
} catch {
  console.info(
    "[DB] Connecting with provided DATABASE_URL (ssl=" +
      String(isProduction) +
      ")",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

// Verify connectivity at startup
pool
  .query("SELECT 1")
  .then(() => {
    console.info("[DB] Connection verified successfully");
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DB] Connection verification FAILED:", message);
  });

export const db = drizzle(pool, { schema });
