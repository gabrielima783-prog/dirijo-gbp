import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DatabaseOptions {
  filename?: string;
  migrationFile?: string;
}

export function createDatabase(options: DatabaseOptions = {}): DatabaseSync {
  const filename = options.filename ?? join(process.cwd(), "data", "dirijo-gbp.sqlite");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename, { timeout: 5_000 });
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const defaultMigration = fileURLToPath(new URL("../../migrations/001_initial.sql", import.meta.url));
  const migration = readFileSync(options.migrationFile ?? defaultMigration, "utf8");
  database.exec(migration);
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
    .run("001_initial", new Date().toISOString());
  const narrativeMigration = fileURLToPath(new URL("../../migrations/002_commercial_narrative.sql", import.meta.url));
  const narrativeApplied = database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get("002_commercial_narrative");
  if (!narrativeApplied) {
    database.exec(readFileSync(narrativeMigration, "utf8"));
    database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
      .run("002_commercial_narrative", new Date().toISOString());
  }
  return database;
}
