/**
 * Applies pending Drizzle migrations at boot.
 *
 * Deliberately uses the migrator (which reads drizzle/meta/_journal.json and
 * records what it has applied in __drizzle_migrations) rather than
 * `drizzle-kit push`. push diffs the live schema against schema.ts and will
 * offer to truncate tables when it sees a difference it can't reconcile — not
 * something that should ever run unattended against production data.
 *
 * The migrator is idempotent: on a database that is already up to date it does
 * nothing. On an empty database it creates every table from scratch, which is
 * what a fresh Railway MySQL plugin needs.
 *
 * A failure here is logged and the server still starts, so a migration problem
 * surfaces as a clear error in the logs rather than a container that restarts
 * forever with no output.
 */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { existsSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[Migrations] DATABASE_URL is not set — skipping.");
    return;
  }

  // In production the server runs from dist/, but the SQL files are not
  // bundled by esbuild, so resolve against the working directory.
  const candidates = [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(import.meta.dirname, "..", "..", "drizzle"),
  ];
  const migrationsFolder = candidates.find((p) => existsSync(path.join(p, "meta", "_journal.json")));

  if (!migrationsFolder) {
    console.error(
      `[Migrations] Could not locate the drizzle folder. Looked in: ${candidates.join(", ")}`
    );
    return;
  }

  let connection: mysql.Connection | null = null;
  try {
    console.log("[Migrations] Checking for pending migrations…");
    // multipleStatements is required: the generated SQL files contain several
    // statements separated by drizzle's breakpoints.
    connection = await mysql.createConnection({ uri: url, multipleStatements: true });
    await migrate(drizzle(connection), { migrationsFolder });
    console.log("[Migrations] Database is up to date.");
  } catch (err) {
    console.error("[Migrations] FAILED — the app may not work correctly:", err);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}
