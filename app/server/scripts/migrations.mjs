import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../src/db/migrations");
const appEnvPath = path.resolve(__dirname, "../../.env");
const ledgerTable = "schema_migrations";

loadEnv({ path: appEnvPath });

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return databaseUrl;
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

async function ensureLedgerTable(client) {
  await client.query(`
    create table if not exists ${ledgerTable} (
      filename text primary key,
      applied_at timestamp with time zone not null default now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    `select filename from ${ledgerTable} order by filename asc`,
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function printStatus(client) {
  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations(client);
  const pending = files.filter((file) => !applied.has(file));

  console.log(`Applied: ${applied.size}`);
  console.log(`Pending: ${pending.length}`);

  if (pending.length > 0) {
    console.log("Pending migrations:");
    for (const file of pending) {
      console.log(`- ${file}`);
    }
  }
}

async function applyPending(client) {
  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations(client);
  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  for (const file of pending) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into ${ledgerTable} (filename) values ($1)`, [
        file,
      ]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(
        `Failed while applying ${file}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  console.log(`Applied ${pending.length} migration(s).`);
}

async function baseline(client) {
  const through = getArgValue("--through");
  const files = await listMigrationFiles();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  let targets = files;
  if (through !== null) {
    const targetName = through.endsWith(".sql") ? through : `${through}.sql`;
    const targetIndex = files.indexOf(targetName);
    if (targetIndex === -1) {
      throw new Error(`Unknown migration: ${through}`);
    }
    targets = files.slice(0, targetIndex + 1);
  }

  await client.query("begin");
  try {
    for (const file of targets) {
      await client.query(
        `insert into ${ledgerTable} (filename) values ($1) on conflict (filename) do nothing`,
        [file],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(`Baselined ${targets.length} migration(s).`);
}

async function main() {
  const command = process.argv[2] ?? "status";
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const client = await pool.connect();
  try {
    await ensureLedgerTable(client);

    if (command === "status") {
      await printStatus(client);
      return;
    }

    if (command === "apply") {
      await applyPending(client);
      return;
    }

    if (command === "baseline") {
      await baseline(client);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
