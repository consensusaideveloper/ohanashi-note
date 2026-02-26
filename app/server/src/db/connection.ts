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

const isProduction = process.env["NODE_ENV"] === "production";

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
