#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "migrations");
const dryRun = process.argv.includes("--dry-run");
const databaseUrl = normalize(process.env.GIDEON_DATABASE_URL ?? process.env.DATABASE_URL);

const migrations = await listMigrations();

if (dryRun) {
  for (const migration of migrations) {
    console.log(`DRY_RUN ${migration.name}`);
  }
  process.exit(0);
}

if (!databaseUrl) {
  console.error("Set GIDEON_DATABASE_URL or DATABASE_URL before running database migrations.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(`create table if not exists gideon_schema_migrations (
    id text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);

  for (const migration of migrations) {
    const existing = await pool.query("select checksum from gideon_schema_migrations where id = $1", [migration.name]);
    if (existing.rows[0]?.checksum === migration.checksum) {
      console.log(`SKIP ${migration.name}`);
      continue;
    }
    if (existing.rows[0]) {
      throw new Error(`Migration checksum changed after apply: ${migration.name}`);
    }
    await pool.query("begin");
    try {
      await pool.query(migration.sql);
      await pool.query("insert into gideon_schema_migrations (id, checksum) values ($1, $2)", [
        migration.name,
        migration.checksum
      ]);
      await pool.query("commit");
      console.log(`APPLY ${migration.name}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
} finally {
  await pool.end();
}

async function listMigrations() {
  const entries = await fs.readdir(migrationsDir);
  const sqlFiles = entries.filter((entry) => /^\d+_.+\.sql$/.test(entry)).sort();
  return Promise.all(
    sqlFiles.map(async (name) => {
      const sql = await fs.readFile(path.join(migrationsDir, name), "utf8");
      return {
        name,
        sql,
        checksum: await sha256(sql)
      };
    })
  );
}

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}
