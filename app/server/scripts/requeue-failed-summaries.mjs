import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appEnvPath = path.resolve(__dirname, "../../.env");

loadEnv({ path: appEnvPath });

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return databaseUrl;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const conversationId = getArgValue("--conversation-id");
  const dryRun = hasFlag("--dry-run");

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const client = await pool.connect();
  try {
    const whereClauses = [
      `summary_status = 'failed'`,
      "summary is null",
      "ended_at is not null",
    ];
    const params = [];

    if (conversationId !== null) {
      params.push(conversationId);
      whereClauses.push(`id = $${params.length}`);
    }

    const whereSql = whereClauses.join(" and ");

    const preview = await client.query(
      `select id, user_id, created_at
       from conversations
       where ${whereSql}
       order by created_at asc`,
      params,
    );

    console.log(`Matched failed summaries: ${preview.rowCount}`);
    for (const row of preview.rows) {
      console.log(
        `- ${row.id} user=${row.user_id} created_at=${row.created_at.toISOString()}`,
      );
    }

    if (dryRun || preview.rowCount === 0) {
      if (dryRun) {
        console.log("Dry run only; no rows updated.");
      }
      return;
    }

    const result = await client.query(
      `update conversations
       set summary_status = 'pending'
       where ${whereSql}`,
      params,
    );

    console.log(`Re-queued summaries: ${result.rowCount ?? 0}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
